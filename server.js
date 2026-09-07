import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SERVICE_RADIUS_KM = Number(process.env.SERVICE_RADIUS_KM || 50);
const FRANCA_LAT = Number(process.env.FRANCA_LAT || -20.5386);
const FRANCA_LON = Number(process.env.FRANCA_LON || -47.4008);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "https://brasilapi.com.br"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"]
    }
  }
}));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/api/", rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
}));

app.use(express.static(path.join(__dirname, "public")));

const allowedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png"
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 12
  },
  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new Error("Tipo de arquivo não permitido."));
    }
    cb(null, true);
  }
});

function normalizeCEP(value = "") {
  return String(value).replace(/\D/g, "").slice(0, 8);
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function lookupCEP(cep) {
  const clean = normalizeCEP(cep);
  if (clean.length !== 8) throw new Error("CEP inválido.");

  const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${clean}`);
  if (!response.ok) throw new Error("Não foi possível consultar o CEP.");

  const data = await response.json();
  const lat = Number(data?.location?.coordinates?.latitude);
  const lon = Number(data?.location?.coordinates?.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("O CEP foi encontrado, mas sem coordenadas suficientes para validar a área.");
  }

  const distanceKm = haversineKm(FRANCA_LAT, FRANCA_LON, lat, lon);

  return {
    cep: clean,
    city: data.city || "",
    state: data.state || "",
    neighborhood: data.neighborhood || "",
    street: data.street || "",
    latitude: lat,
    longitude: lon,
    distanceKm: Number(distanceKm.toFixed(1)),
    inServiceArea: distanceKm <= SERVICE_RADIUS_KM
  };
}

app.get("/api/cep/:cep", async (req, res) => {
  try {
    const info = await lookupCEP(req.params.cep);
    res.json(info);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

function validatePreScreen(body) {
  const product = body.product;

  if (!["clt", "inss", "giro", "veiculo"].includes(product)) {
    return "Produto inválido.";
  }

  if (!body.fullName || !body.cpf || !body.phone || !body.cep) {
    return "Preencha nome, CPF, telefone e CEP.";
  }

  if (body.consent !== "true") {
    return "É necessário aceitar a política de privacidade.";
  }

  if (product === "clt") {
    const months = Number(body.employmentMonths || 0);
    if (months < 6) {
      return "Para o Crédito Pessoal CLT é necessário ter pelo menos 6 meses de registro no emprego atual.";
    }
  }

  if (product === "giro") {
    const cnpjMonths = Number(body.cnpjMonths || 0);
    if (cnpjMonths < 6) {
      return "Para o Capital de Giro é necessário que o CNPJ tenha pelo menos 6 meses.";
    }
  }

  return null;
}

function requiredFilesFor(product, body) {
  if (product === "clt") {
    return ["identidade", "residencia", "holerite", "extratos"];
  }

  if (product === "inss") {
    const base = ["identidade", "residencia", "beneficio"];
    if (body.isRepresentative === "true") {
      base.push("identidadeRepresentante", "representacao");
    }
    return base;
  }

  if (product === "giro") {
    return [
      "identidade",
      "residencia",
      "extratosPJ",
      "cartaoCNPJ",
      "enderecoEmpresa",
      "fachada"
    ];
  }

  if (product === "veiculo") {
    return ["identidade", "residencia", "crlv"];
  }

  return [];
}

async function forwardToN8n(payload, files) {
  const webhook = process.env.N8N_WEBHOOK_URL;
  if (!webhook) return false;

  const form = new FormData();
  form.append("payload", JSON.stringify(payload));

  for (const file of files) {
    const blob = new Blob([file.buffer], { type: file.mimetype });
    form.append(file.fieldname, blob, file.originalname);
  }

  const response = await fetch(webhook, {
    method: "POST",
    body: form
  });

  if (!response.ok) {
    throw new Error("O webhook de integração recusou a solicitação.");
  }

  return true;
}

async function saveLocalForDevelopment(payload, files) {
  if (process.env.ALLOW_LOCAL_DEV_STORAGE !== "true") return false;

  const id = payload.submissionId;
  const dir = path.join(__dirname, "data", "submissions", id);
  await fs.mkdir(dir, { recursive: true });

  await fs.writeFile(
    path.join(dir, "lead.json"),
    JSON.stringify(payload, null, 2),
    "utf8"
  );

  for (const file of files) {
    const safeName = file.originalname.replace(/[^\w.\-]+/g, "_");
    await fs.writeFile(
      path.join(dir, `${file.fieldname}-${safeName}`),
      file.buffer
    );
  }

  return true;
}

app.post("/api/submit", upload.any(), async (req, res) => {
  try {
    const validationError = validatePreScreen(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const cepInfo = await lookupCEP(req.body.cep);

    if (["clt", "inss"].includes(req.body.product) && !cepInfo.inServiceArea) {
      return res.status(400).json({
        error: "Atualmente este produto está disponível para Franca/SP e localidades em um raio de até 50 km."
      });
    }

    const files = req.files || [];
    const required = requiredFilesFor(req.body.product, req.body);
    const receivedFields = new Set(files.map((file) => file.fieldname));

    const missing = required.filter((field) => !receivedFields.has(field));
    if (missing.length) {
      return res.status(400).json({
        error: "Envie todos os documentos obrigatórios antes de concluir."
      });
    }

    const submissionId = crypto.randomUUID();

    const payload = {
      submissionId,
      createdAt: new Date().toISOString(),
      product: req.body.product,
      requestedAmount: Number(req.body.requestedAmount || 0),
      fullName: req.body.fullName,
      cpf: req.body.cpf,
      phone: req.body.phone,
      email: req.body.email || "",
      cep: req.body.cep,
      city: cepInfo.city,
      state: cepInfo.state,
      distanceKm: cepInfo.distanceKm,
      employmentMonths: req.body.employmentMonths || "",
      employer: req.body.employer || "",
      netIncome: req.body.netIncome || "",
      benefitType: req.body.benefitType || "",
      benefitAmount: req.body.benefitAmount || "",
      benefitMonths: req.body.benefitMonths || "",
      benefitBank: req.body.benefitBank || "",
      isRepresentative: req.body.isRepresentative || "false",
      cnpj: req.body.cnpj || "",
      cnpjMonths: req.body.cnpjMonths || "",
      cardSales: req.body.cardSales || "",
      vehicleModel: req.body.vehicleModel || "",
      vehicleYear: req.body.vehicleYear || "",
      consent: true,
      fileNames: files.map((f) => ({
        field: f.fieldname,
        name: f.originalname,
        type: f.mimetype,
        size: f.size
      }))
    };

    const forwarded = await forwardToN8n(payload, files);
    const storedLocally = forwarded ? false : await saveLocalForDevelopment(payload, files);

    if (!forwarded && !storedLocally) {
      return res.status(503).json({
        error: "A integração de envio ainda não foi configurada. Configure N8N_WEBHOOK_URL no servidor."
      });
    }

    res.json({
      ok: true,
      submissionId,
      message: "Solicitação enviada com sucesso."
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error.message || "Não foi possível concluir a solicitação."
    });
  }
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      error: error.code === "LIMIT_FILE_SIZE"
        ? "Cada arquivo pode ter no máximo 10 MB."
        : "Não foi possível processar os arquivos."
    });
  }

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  next();
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`ARDIRE rodando em http://localhost:${PORT}`);
});
