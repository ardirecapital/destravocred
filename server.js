import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import nodemailer from "nodemailer";
import archiver from "archiver";
import { PassThrough } from "stream";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);

const SERVICE_CITIES = new Map([
  ["franca|sp", { name: "Franca", state: "SP", appointmentOnly: false }],
  ["restinga|sp", { name: "Restinga", state: "SP", appointmentOnly: false }],
  ["patrocinio paulista|sp", { name: "Patrocínio Paulista", state: "SP", appointmentOnly: false }],
  ["cristais paulista|sp", { name: "Cristais Paulista", state: "SP", appointmentOnly: false }],
  ["itirapua|sp", { name: "Itirapuã", state: "SP", appointmentOnly: false }],
  ["sao jose da bela vista|sp", { name: "São José da Bela Vista", state: "SP", appointmentOnly: false }],
  ["cassia|mg", { name: "Cássia", state: "MG", appointmentOnly: true }],
  ["ibiraci|mg", { name: "Ibiraci", state: "MG", appointmentOnly: true }]
]);

const ALLOWED_INSS_BENEFITS = new Set([
  "aposentadoria",
  "pensao",
  "bpc_idoso",
  "bpc_pcd"
]);

const CREDIT_OPTIONS = {
  clt: {
    500: { 3: 250, 6: 160, 9: 135, 12: 115 },
    1000: { 3: 495, 6: 315, 9: 265, 12: 225 },
    1500: { 3: 745, 6: 470, 9: 395, 12: 340 },
    2000: { 3: 990, 6: 625, 9: 525, 12: 450 }
  },
  inss: {
    500: { 3: 250, 6: 160, 9: 135, 12: 115, 18: 110, 36: 85 },
    1000: { 3: 495, 6: 315, 9: 265, 12: 225, 18: 220, 36: 170 },
    1500: { 3: 745, 6: 470, 9: 395, 12: 340, 18: 330, 36: 255 },
    2000: { 3: 990, 6: 625, 9: 525, 12: 450, 18: 440, 36: 340 }
  },
  bolsa: {
    500: { 3: 250, 6: 160 }
  }
};

const PRODUCT_LABELS = {
  clt: "CLT",
  inss: "INSS",
  bolsa: "Bolsa Família"
};

const BENEFIT_LABELS = {
  aposentadoria: "Aposentadoria",
  pensao: "Pensão por morte",
  bpc_idoso: "BPC/LOAS Idoso",
  bpc_pcd: "BPC/LOAS Pessoa com Deficiência",
  bolsa: "Bolsa Família"
};

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
    if (file.fieldname === "extratos") {
      if (file.mimetype !== "application/pdf") {
        return cb(new Error("Os extratos bancários devem ser enviados somente em PDF."));
      }
      return cb(null, true);
    }

    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new Error("Tipo de arquivo não permitido."));
    }
    cb(null, true);
  }
});

function normalizeCEP(value = "") {
  return String(value).replace(/\D/g, "").slice(0, 8);
}

function normalizeDigits(value = "") {
  return String(value).replace(/\D/g, "");
}

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const number = Number(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function serviceCityInfo(city, state) {
  const key = `${normalizeText(city)}|${String(state || "").trim().toLowerCase()}`;
  return SERVICE_CITIES.get(key) || null;
}

async function lookupCEP(cep) {
  const clean = normalizeCEP(cep);
  if (clean.length !== 8) throw new Error("CEP inválido.");

  const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${clean}`);
  if (!response.ok) throw new Error("Não foi possível consultar o CEP.");

  const data = await response.json();
  const city = data.city || "";
  const state = String(data.state || "").toUpperCase();
  const serviceCity = serviceCityInfo(city, state);

  return {
    cep: clean,
    city,
    state,
    neighborhood: data.neighborhood || "",
    street: data.street || "",
    inServiceArea: Boolean(serviceCity),
    appointmentOnly: Boolean(serviceCity?.appointmentOnly),
    serviceCityName: serviceCity?.name || ""
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

function getReferenceInstallment(product, requestedAmount, selectedTerm) {
  const productOptions = CREDIT_OPTIONS[product];
  if (!productOptions) return null;

  const amountOptions = productOptions[requestedAmount];
  if (!amountOptions) return null;

  const installment = amountOptions[selectedTerm];
  return Number.isFinite(Number(installment)) ? Number(installment) : null;
}

function validateApplicationData(body, { requireConsent = false } = {}) {
  const product = body.product;

  if (!Object.hasOwn(CREDIT_OPTIONS, product)) {
    return "Produto inválido.";
  }

  if (!body.fullName || !body.cpf || !body.phone || !body.cep) {
    return "Preencha nome, CPF, telefone e CEP.";
  }

  if (normalizeDigits(body.cpf).length !== 11) {
    return "Informe um CPF válido com 11 dígitos.";
  }

  if (normalizeDigits(body.phone).length < 10) {
    return "Informe um telefone válido.";
  }

  if (requireConsent && body.consent !== "true") {
    return "É necessário aceitar os Termos de Uso e a Política de Privacidade.";
  }

  const requestedAmount = Number(body.requestedAmount || 0);
  const selectedTerm = Number(body.selectedTerm || 0);
  const installmentAmount = Number(body.installmentAmount || 0);
  const referenceInstallment = getReferenceInstallment(product, requestedAmount, selectedTerm);

  if (referenceInstallment === null || installmentAmount !== referenceInstallment) {
    return "A opção de valor ou parcela selecionada não é válida. Faça a simulação novamente.";
  }

  if (product === "clt") {
    const months = Number(body.employmentMonths || 0);
    if (months < 4) {
      return "Para o Crédito Pessoal CLT é necessário ter pelo menos 4 meses de registro no emprego atual.";
    }
  }

  if (product === "inss" && !ALLOWED_INSS_BENEFITS.has(body.benefitType)) {
    return "Selecione um tipo de benefício INSS aceito para análise.";
  }

  return null;
}

function requiredFilesFor(product, body) {
  if (product === "clt") {
    return ["identidade", "residencia", "holerite", "extratos"];
  }

  if (product === "inss") {
    const base = ["identidade", "residencia", "beneficio", "extratos"];
    if (body.isRepresentative === "true") {
      base.push("identidadeRepresentante", "representacao");
    }
    return base;
  }

  if (product === "bolsa") {
    return ["identidade", "residencia", "beneficio", "extratos"];
  }

  return [];
}

function buildPayload(body, cepInfo, submissionId = crypto.randomUUID()) {
  const requestedAmount = Number(body.requestedAmount || 0);
  const selectedTerm = Number(body.selectedTerm || 0);
  const installmentAmount = Number(body.installmentAmount || 0);

  return {
    submissionId,
    createdAt: new Date().toISOString(),
    product: body.product,
    productLabel: PRODUCT_LABELS[body.product] || body.product,
    requestedAmount,
    selectedTerm,
    installmentAmount,
    installmentLabel: `${selectedTerm}x de R$ ${installmentAmount}`,
    fullName: String(body.fullName || "").trim(),
    cpf: String(body.cpf || "").trim(),
    phone: String(body.phone || "").trim(),
    email: String(body.email || "").trim(),
    cep: body.cep,
    city: cepInfo.city,
    state: cepInfo.state,
    serviceAreaApproved: true,
    appointmentOnly: cepInfo.appointmentOnly,
    employmentMonths: body.employmentMonths || "",
    employer: body.employer || "",
    netIncome: body.netIncome || "",
    benefitType: body.product === "bolsa" ? "bolsa" : (body.benefitType || ""),
    benefitTypeLabel: body.product === "bolsa"
      ? BENEFIT_LABELS.bolsa
      : (BENEFIT_LABELS[body.benefitType] || ""),
    benefitAmount: body.benefitAmount || "",
    benefitMonths: body.benefitMonths || "",
    benefitBank: body.benefitBank || "",
    isRepresentative: body.isRepresentative || "false",
    source: "Site ARDIRE"
  };
}

function kommoConfig() {
  const subdomain = String(process.env.KOMMO_SUBDOMAIN || "").trim();
  const token = String(process.env.KOMMO_ACCESS_TOKEN || "").trim();
  if (!subdomain || !token) {
    throw new Error("Integração Kommo não configurada no servidor.");
  }
  return {
    subdomain,
    token,
    baseUrl: `https://${subdomain}.kommo.com/api/v4`
  };
}

async function kommoRequest(endpoint, options = {}) {
  const { token, baseUrl } = kommoConfig();
  const url = endpoint.startsWith("http") ? endpoint : `${baseUrl}${endpoint}`;
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers,
    body: options.body && !(options.body instanceof FormData) && typeof options.body !== "string"
      ? JSON.stringify(options.body)
      : options.body
  });

  if (response.status === 204) return null;
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const detail = typeof data === "string"
      ? data
      : (data?.detail || data?.title || data?.message || JSON.stringify(data));
    throw new Error(`Kommo ${response.status}: ${detail || "erro de integração"}`);
  }

  return data;
}

let kommoMetadataCache = null;
let kommoMetadataCachedAt = 0;
const KOMMO_METADATA_TTL = 5 * 60 * 1000;

async function getKommoMetadata() {
  if (kommoMetadataCache && Date.now() - kommoMetadataCachedAt < KOMMO_METADATA_TTL) {
    return kommoMetadataCache;
  }

  const [account, pipelinesResponse, leadFieldsResponse, contactFieldsResponse] = await Promise.all([
    kommoRequest("/account?with=drive_url"),
    kommoRequest("/leads/pipelines"),
    kommoRequest("/leads/custom_fields?limit=250"),
    kommoRequest("/contacts/custom_fields?limit=250")
  ]);

  const pipelines = pipelinesResponse?._embedded?.pipelines || [];
  const pipeline = pipelines.find((item) => item.is_main && !item.is_archive)
    || pipelines.find((item) => normalizeText(item.name) === "funil de vendas" && !item.is_archive)
    || pipelines.find((item) => !item.is_archive);

  if (!pipeline) throw new Error("Nenhum funil ativo foi encontrado no Kommo.");

  const statuses = pipeline?._embedded?.statuses || [];
  const leadFields = leadFieldsResponse?._embedded?.custom_fields || [];
  const contactFields = contactFieldsResponse?._embedded?.custom_fields || [];

  const byName = (items, name) => items.find((item) => normalizeText(item.name) === normalizeText(name));
  const byCode = (items, code) => items.find((item) => String(item.code || "").toUpperCase() === code);

  kommoMetadataCache = {
    account,
    driveUrl: account?.drive_url || "",
    currentUserId: account?.current_user_id || null,
    pipeline,
    statuses,
    leadFields,
    contactFields,
    leadField: (name) => byName(leadFields, name),
    contactField: (name) => byName(contactFields, name),
    contactFieldByCode: (code) => byCode(contactFields, code),
    status: (name) => byName(statuses, name)
  };
  kommoMetadataCachedAt = Date.now();

  return kommoMetadataCache;
}

function enumIdFor(field, desiredLabel) {
  if (!field || !desiredLabel) return null;
  const wanted = normalizeText(desiredLabel);
  const match = (field.enums || []).find((item) => normalizeText(item.value) === wanted);
  return match?.id || null;
}

function fieldValue(field, value, { enumLabel = null, personName = "" } = {}) {
  if (!field || value === undefined || value === null || value === "") return null;

  if (["select", "multiselect", "radiobutton", "category"].includes(field.type)) {
    const enumId = enumIdFor(field, enumLabel || value);
    if (enumId) {
      return { field_id: field.id, values: [{ enum_id: enumId }] };
    }
    return { field_id: field.id, values: [{ value: enumLabel || String(value) }] };
  }

  if (field.type === "numeric") {
    return { field_id: field.id, values: [{ value: Number(value) }] };
  }

  if (field.type === "date_time" || field.type === "date" || field.type === "birthday") {
    const timestamp = typeof value === "number" ? value : Math.floor(new Date(value).getTime() / 1000);
    return { field_id: field.id, values: [{ value: timestamp }] };
  }

  if (field.type === "legal_entity") {
    const digits = normalizeDigits(value);
    return {
      field_id: field.id,
      values: [{
        value: {
          name: personName || "Pessoa física",
          entity_type: 1,
          vat_id: digits
        }
      }]
    };
  }

  return { field_id: field.id, values: [{ value: String(value) }] };
}

function compactCustomFields(values) {
  return values.filter(Boolean);
}

async function findExistingContact(phone, cpf) {
  const queries = [phone, normalizeDigits(phone), cpf, normalizeDigits(cpf)].filter(Boolean);
  for (const query of queries) {
    const response = await kommoRequest(`/contacts?query=${encodeURIComponent(query)}&limit=50`);
    const contacts = response?._embedded?.contacts || [];
    if (!contacts.length) continue;

    const phoneDigits = normalizeDigits(phone);
    const cpfDigits = normalizeDigits(cpf);

    const exact = contacts.find((contact) => {
      const values = (contact.custom_fields_values || [])
        .flatMap((field) => field.values || [])
        .map((item) => normalizeDigits(item.value));
      return (phoneDigits && values.includes(phoneDigits)) || (cpfDigits && values.includes(cpfDigits));
    });

    if (exact) return exact;
  }
  return null;
}

async function upsertKommoContact(payload, metadata) {
  const phoneField = metadata.contactFieldByCode("PHONE");
  const emailField = metadata.contactFieldByCode("EMAIL");
  const cpfField = metadata.contactField("CPF");
  const cityField = metadata.contactField("Cidade");

  const customFields = [];
  if (phoneField && payload.phone) {
    customFields.push({
      field_id: phoneField.id,
      values: [{ value: payload.phone, enum_code: "MOB" }]
    });
  }
  if (emailField && payload.email) {
    customFields.push({
      field_id: emailField.id,
      values: [{ value: payload.email, enum_code: "WORK" }]
    });
  }
  customFields.push(fieldValue(cpfField, payload.cpf, { personName: payload.fullName }));
  customFields.push(fieldValue(cityField, `${payload.city}/${payload.state}`));

  const contactBody = {
    name: payload.fullName,
    responsible_user_id: metadata.currentUserId || undefined,
    custom_fields_values: compactCustomFields(customFields)
  };

  const existing = await findExistingContact(payload.phone, payload.cpf);
  if (existing?.id) {
    await kommoRequest(`/contacts/${existing.id}`, {
      method: "PATCH",
      body: contactBody
    });
    return existing.id;
  }

  const created = await kommoRequest("/contacts", {
    method: "POST",
    body: [contactBody]
  });

  const contactId = created?._embedded?.contacts?.[0]?.id;
  if (!contactId) throw new Error("O Kommo não retornou o ID do contato criado.");
  return contactId;
}

function leadCustomFieldValues(payload, metadata, resultLabel) {
  const incomeOrBenefit = payload.product === "clt"
    ? parseMoney(payload.netIncome)
    : parseMoney(payload.benefitAmount);

  const productField = metadata.leadField("Produto solicitado");
  const requestedField = metadata.leadField("Valor solicitado");
  const termField = metadata.leadField("Prazo escolhido");
  const installmentField = metadata.leadField("Valor da parcela");
  const incomeField = metadata.leadField("Renda / benefício");
  const employerField = metadata.leadField("Empresa atual");
  const monthsField = metadata.leadField("Meses no emprego");
  const benefitTypeField = metadata.leadField("Tipo de benefício");
  const resultField = metadata.leadField("Resultado da pré-análise");
  const sourceField = metadata.leadField("Origem do lead");
  const dateField = metadata.leadField("Data/hora da solicitação");
  const observationsField = metadata.leadField("Observações");

  const notes = [
    `ID da solicitação: ${payload.submissionId}`,
    `Cidade: ${payload.city}/${payload.state}`,
    payload.appointmentOnly ? "Atendimento presencial em dia agendado." : "",
    payload.product === "inss" && payload.isRepresentative === "true" ? "Solicitação realizada por representante legal." : "",
    payload.product !== "clt" && payload.benefitBank ? `Banco do benefício: ${payload.benefitBank}` : "",
    payload.product === "inss" && payload.benefitMonths ? `Tempo recebendo benefício: ${payload.benefitMonths} meses.` : ""
  ].filter(Boolean).join("\n");

  return compactCustomFields([
    fieldValue(productField, payload.productLabel, { enumLabel: payload.productLabel }),
    fieldValue(requestedField, payload.requestedAmount),
    fieldValue(termField, payload.selectedTerm),
    fieldValue(installmentField, payload.installmentAmount),
    fieldValue(incomeField, incomeOrBenefit || ""),
    fieldValue(employerField, payload.employer || ""),
    fieldValue(monthsField, payload.employmentMonths || ""),
    fieldValue(benefitTypeField, payload.benefitTypeLabel || "", { enumLabel: payload.benefitTypeLabel || "" }),
    fieldValue(resultField, resultLabel, { enumLabel: resultLabel }),
    fieldValue(sourceField, "Site ARDIRE"),
    fieldValue(dateField, payload.createdAt),
    fieldValue(observationsField, notes)
  ]);
}

async function createKommoLead(payload) {
  const metadata = await getKommoMetadata();
  const status = metadata.status("Pré-análise concluída");
  if (!status) throw new Error("Etapa 'Pré-análise concluída' não encontrada no Kommo.");

  const contactId = await upsertKommoContact(payload, metadata);
  const tagName = payload.product === "bolsa" ? "BOLSA_FAMILIA" : payload.productLabel.toUpperCase();

  const leadBody = {
    name: `${payload.productLabel} — ${payload.fullName} — R$ ${payload.requestedAmount}`,
    pipeline_id: metadata.pipeline.id,
    status_id: status.id,
    responsible_user_id: metadata.currentUserId || undefined,
    custom_fields_values: leadCustomFieldValues(payload, metadata, "Pré-análise concluída"),
    _embedded: {
      contacts: [{ id: contactId }],
      tags: [{ name: tagName }, { name: "SITE_ARDIRE" }]
    }
  };

  const created = await kommoRequest("/leads", {
    method: "POST",
    body: [leadBody]
  });

  const leadId = created?._embedded?.leads?.[0]?.id;
  if (!leadId) throw new Error("O Kommo não retornou o ID do lead criado.");

  return { leadId, contactId };
}

async function updateKommoLeadAfterDocuments(payload, leadId) {
  const metadata = await getKommoMetadata();
  const status = metadata.status("Documentos recebidos");
  if (!status) throw new Error("Etapa 'Documentos recebidos' não encontrada no Kommo.");

  await kommoRequest(`/leads/${leadId}`, {
    method: "PATCH",
    body: {
      status_id: status.id,
      pipeline_id: metadata.pipeline.id,
      custom_fields_values: leadCustomFieldValues(payload, metadata, "Documentos recebidos")
    }
  });
}

function leadRefSecret() {
  return crypto.createHash("sha256")
    .update(String(process.env.KOMMO_ACCESS_TOKEN || "ardire-dev-secret"))
    .digest();
}

function signLeadRef(data) {
  const encoded = Buffer.from(JSON.stringify(data)).toString("base64url");
  const signature = crypto.createHmac("sha256", leadRefSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyLeadRef(token) {
  const [encoded, signature] = String(token || "").split(".");
  if (!encoded || !signature) return null;

  const expected = crypto.createHmac("sha256", leadRefSecret()).update(encoded).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!data.leadId || !data.issuedAt) return null;
    if (Date.now() - Number(data.issuedAt) > 24 * 60 * 60 * 1000) return null;
    return data;
  } catch {
    return null;
  }
}

async function uploadSingleFileToKommo(file, driveUrl) {
  const { token } = kommoConfig();
  if (!driveUrl) throw new Error("O Kommo não retornou o endereço do serviço de arquivos.");

  const sessionResponse = await fetch(`${driveUrl}/v1.0/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      file_name: file.originalname,
      file_size: file.size,
      content_type: file.mimetype,
      with_preview: false
    })
  });

  const sessionText = await sessionResponse.text();
  const session = sessionText ? JSON.parse(sessionText) : null;
  if (!sessionResponse.ok || !session?.upload_url) {
    throw new Error(`Falha ao iniciar upload de arquivo no Kommo (${sessionResponse.status}).`);
  }

  let nextUrl = session.upload_url;
  const maxPartSize = Number(session.max_part_size || file.size);
  let offset = 0;
  let finalResult = null;

  while (offset < file.size) {
    const end = Math.min(offset + maxPartSize, file.size);
    const part = file.buffer.subarray(offset, end);
    const form = new FormData();
    form.append("RAW_BODY", new Blob([part], { type: file.mimetype }), file.originalname);

    const uploadResponse = await fetch(nextUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      },
      body: form
    });

    const uploadText = await uploadResponse.text();
    let uploadData = null;
    try {
      uploadData = uploadText ? JSON.parse(uploadText) : null;
    } catch {
      uploadData = uploadText;
    }

    if (!uploadResponse.ok) {
      const detail = typeof uploadData === "string"
        ? uploadData
        : (uploadData?.detail || uploadData?.title || uploadData?.message || JSON.stringify(uploadData || {}));
      throw new Error(`Falha ao enviar arquivo ao Kommo (${uploadResponse.status})${detail ? `: ${detail}` : ""}.`);
    }

    if (uploadData?.uuid) {
      finalResult = uploadData;
      break;
    }

    if (!uploadData?.next_url) {
      throw new Error("O Kommo não retornou a próxima etapa do upload de arquivo.");
    }

    nextUrl = uploadData.next_url;
    offset = end;
  }

  if (!finalResult?.uuid) {
    throw new Error("O Kommo não retornou o identificador do arquivo enviado.");
  }

  return finalResult;
}

async function attachFilesToKommoLead(files, leadId) {
  const metadata = await getKommoMetadata();
  const uploaded = [];

  for (const file of files) {
    uploaded.push(await uploadSingleFileToKommo(file, metadata.driveUrl));
  }

  if (uploaded.length) {
    await kommoRequest(`/leads/${leadId}/files`, {
      method: "PUT",
      body: uploaded.map((item) => ({ file_uuid: item.uuid }))
    });
  }

  return uploaded;
}

function safeFileBase(value) {
  return String(value || "arquivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 70) || "arquivo";
}

function extensionFromFile(file) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (ext) return ext;
  if (file.mimetype === "application/pdf") return ".pdf";
  if (file.mimetype === "image/png") return ".png";
  if (file.mimetype === "image/jpeg") return ".jpg";
  return "";
}

function organizedFileName(file, counters) {
  const ext = extensionFromFile(file);
  const names = {
    identidade: "RG_CNH",
    residencia: "COMPROVANTE_RESIDENCIA",
    holerite: "HOLERITE",
    beneficio: "COMPROVANTE_BENEFICIO",
    identidadeRepresentante: "RG_CNH_REPRESENTANTE",
    representacao: "DOCUMENTO_REPRESENTACAO"
  };

  if (file.fieldname === "extratos") {
    counters.extratos += 1;
    return `EXTRATO_BANCARIO_${String(counters.extratos).padStart(2, "0")}${ext}`;
  }

  return `${names[file.fieldname] || safeFileBase(file.fieldname)}${ext}`;
}

function formatDateBR(iso) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "medium"
  }).format(new Date(iso));
}

function buildApplicationText(payload) {
  return [
    "ARDIRE CAPITAL — DADOS DA SOLICITAÇÃO",
    "",
    `ID: ${payload.submissionId}`,
    `Data/hora: ${formatDateBR(payload.createdAt)}`,
    `Origem: ${payload.source}`,
    "",
    "CLIENTE",
    `Nome: ${payload.fullName}`,
    `CPF: ${payload.cpf}`,
    `Telefone: ${payload.phone}`,
    `E-mail: ${payload.email || "Não informado"}`,
    `CEP: ${payload.cep}`,
    `Cidade: ${payload.city}/${payload.state}`,
    `Atendimento agendado: ${payload.appointmentOnly ? "Sim" : "Não"}`,
    "",
    "PROPOSTA",
    `Produto: ${payload.productLabel}`,
    `Valor solicitado: R$ ${payload.requestedAmount}`,
    `Prazo escolhido: ${payload.selectedTerm}x`,
    `Valor da parcela: R$ ${payload.installmentAmount}`,
    "",
    payload.product === "clt" ? `Empresa atual: ${payload.employer || "Não informado"}` : "",
    payload.product === "clt" ? `Meses no emprego: ${payload.employmentMonths || "Não informado"}` : "",
    payload.product === "clt" ? `Renda líquida aproximada: R$ ${payload.netIncome || "Não informado"}` : "",
    payload.product !== "clt" ? `Tipo de benefício: ${payload.benefitTypeLabel || "Não informado"}` : "",
    payload.product !== "clt" ? `Valor do benefício: R$ ${payload.benefitAmount || "Não informado"}` : "",
    payload.product === "inss" ? `Meses recebendo benefício: ${payload.benefitMonths || "Não informado"}` : "",
    payload.product !== "clt" ? `Banco do benefício: ${payload.benefitBank || "Não informado"}` : "",
    payload.product === "inss" ? `Representante legal: ${payload.isRepresentative === "true" ? "Sim" : "Não"}` : "",
    "",
    "RESULTADO",
    "Pré-análise: concluída",
    "Documentos: recebidos",
    "Crédito sujeito à análise e aprovação.",
    "",
    "ACEITES",
    `Termos/Política aceitos em: ${formatDateBR(payload.consentAcceptedAt)}`,
    `Política de Privacidade: ${payload.privacyPolicyVersion}`,
    `Termos de Uso: ${payload.termsVersion}`,
    "Ciência de visita/verificação e cobrança presencial: Sim"
  ].filter((line) => line !== "").join("\n");
}

async function createZipBuffer(payload, files) {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const output = new PassThrough();
  const chunks = [];
  const counters = { extratos: 0 };

  const done = new Promise((resolve, reject) => {
    output.on("data", (chunk) => chunks.push(chunk));
    output.on("end", () => resolve(Buffer.concat(chunks)));
    output.on("error", reject);
    archive.on("error", reject);
  });

  archive.pipe(output);
  archive.append(buildApplicationText(payload), { name: "DADOS_DA_SOLICITACAO.txt" });

  for (const file of files) {
    archive.append(file.buffer, { name: organizedFileName(file, counters) });
  }

  await archive.finalize();
  return done;
}

function mailTransporter() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 0);
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").replace(/\s+/g, "");
  if (!host || !port || !user || !pass) {
    throw new Error("Envio de e-mail não configurado no servidor.");
  }

  const secure = String(process.env.SMTP_SECURE || "true").toLowerCase() === "true";
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function emailHtml(payload, attachedZip) {
  const rows = [
    ["ID da solicitação", payload.submissionId],
    ["Data/hora", formatDateBR(payload.createdAt)],
    ["Nome", payload.fullName],
    ["CPF", payload.cpf],
    ["Telefone", payload.phone],
    ["E-mail", payload.email || "Não informado"],
    ["Cidade", `${payload.city}/${payload.state}`],
    ["Produto", payload.productLabel],
    ["Valor solicitado", `R$ ${payload.requestedAmount}`],
    ["Opção escolhida", `${payload.selectedTerm}x de R$ ${payload.installmentAmount}`],
    ["Renda / benefício", payload.product === "clt" ? `R$ ${payload.netIncome || "Não informado"}` : `R$ ${payload.benefitAmount || "Não informado"}`],
    ["Empresa atual", payload.product === "clt" ? (payload.employer || "Não informado") : "—"],
    ["Meses no emprego", payload.product === "clt" ? (payload.employmentMonths || "Não informado") : "—"],
    ["Tipo de benefício", payload.product !== "clt" ? (payload.benefitTypeLabel || "Não informado") : "—"],
    ["Banco do benefício", payload.product !== "clt" ? (payload.benefitBank || "Não informado") : "—"],
    ["Resultado", "Pré-análise concluída / Documentos recebidos"],
    ["Origem", "Site ARDIRE"]
  ];

  const tableRows = rows.map(([label, value]) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;font-weight:600;">${escapeHtml(label)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;">${escapeHtml(value)}</td>
    </tr>`).join("");

  const documentMessage = attachedZip
    ? "Os documentos seguem organizados no arquivo ZIP anexo e também foram vinculados ao lead no Kommo."
    : "O pacote de documentos ultrapassou o limite seguro para anexo por e-mail. Os documentos foram vinculados ao lead no Kommo.";

  return `
    <div style="font-family:Arial,sans-serif;color:#222;max-width:760px;margin:auto;">
      <h2 style="margin-bottom:4px;">Nova solicitação — ${escapeHtml(payload.productLabel)}</h2>
      <p style="margin-top:0;color:#666;">ARDIRE Capital / Site ARDIRE</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">${tableRows}</table>
      <p style="margin-top:20px;"><strong>Documentos:</strong> ${escapeHtml(documentMessage)}</p>
      <p style="color:#666;font-size:12px;">Crédito sujeito à análise e aprovação. Este e-mail contém dados pessoais e deve ser tratado de forma confidencial.</p>
    </div>`;
}

async function sendApplicationEmail(payload, files) {
  const transporter = mailTransporter();
  const zipBuffer = await createZipBuffer(payload, files);
  const maxZipBytes = 18 * 1024 * 1024;
  const attachZip = zipBuffer.length <= maxZipBytes;
  const zipName = `ARDIRE_${safeFileBase(payload.productLabel)}_${safeFileBase(payload.fullName)}_${payload.submissionId.slice(0, 8)}.zip`;

  const mailTo = String(process.env.MAIL_TO || process.env.SMTP_USER || "").trim();
  const mailFrom = String(process.env.MAIL_FROM || process.env.SMTP_USER || "").trim();
  if (!mailTo || !mailFrom) throw new Error("Destinatário/remetente de e-mail não configurado.");

  await transporter.sendMail({
    from: mailFrom,
    to: mailTo,
    subject: `NOVA SOLICITAÇÃO ${payload.productLabel.toUpperCase()} — ${payload.fullName.toUpperCase()} — R$ ${payload.requestedAmount}`,
    text: `${buildApplicationText(payload)}\n\n${attachZip ? "Documentos no ZIP anexo." : "Documentos vinculados ao lead no Kommo; o pacote excedeu o limite seguro de anexo por e-mail."}`,
    html: emailHtml(payload, attachZip),
    attachments: attachZip ? [{ filename: zipName, content: zipBuffer, contentType: "application/zip" }] : []
  });

  return { attachedZip: attachZip, zipBytes: zipBuffer.length };
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

app.post("/api/prescreen", async (req, res) => {
  try {
    const validationError = validateApplicationData(req.body, { requireConsent: false });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const cepInfo = await lookupCEP(req.body.cep);
    if (!cepInfo.inServiceArea) {
      return res.status(400).json({
        error: "Atualmente atendemos Franca, Restinga, Patrocínio Paulista, Cristais Paulista, Itirapuã, São José da Bela Vista, Cássia e Ibiraci."
      });
    }

    const payload = buildPayload(req.body, cepInfo);
    const { leadId, contactId } = await createKommoLead(payload);
    const leadRef = signLeadRef({
      leadId,
      contactId,
      submissionId: payload.submissionId,
      issuedAt: Date.now()
    });

    res.json({
      ok: true,
      leadRef,
      submissionId: payload.submissionId,
      message: "Pré-análise registrada com sucesso."
    });
  } catch (error) {
    console.error("Erro na pré-análise/Kommo:", error);
    res.status(502).json({
      error: "Não foi possível registrar a pré-análise no momento. Tente novamente em instantes."
    });
  }
});

app.post("/api/submit", upload.any(), async (req, res) => {
  try {
    const validationError = validateApplicationData(req.body, { requireConsent: true });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const cepInfo = await lookupCEP(req.body.cep);
    if (!cepInfo.inServiceArea) {
      return res.status(400).json({
        error: "Atualmente atendemos Franca, Restinga, Patrocínio Paulista, Cristais Paulista, Itirapuã, São José da Bela Vista, Cássia e Ibiraci."
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

    const bankStatements = files.filter((file) => file.fieldname === "extratos");
    if (bankStatements.length < 1 || bankStatements.length > 3) {
      return res.status(400).json({
        error: "Envie de 1 a 3 extratos bancários em PDF que cubram os últimos 90 dias."
      });
    }

    if (bankStatements.some((file) => file.mimetype !== "application/pdf")) {
      return res.status(400).json({
        error: "Os extratos bancários devem ser enviados somente em PDF."
      });
    }

    let ref = verifyLeadRef(req.body.leadRef);
    let submissionId = ref?.submissionId || crypto.randomUUID();
    const payload = buildPayload(req.body, cepInfo, submissionId);
    payload.consent = true;
    payload.consentAcceptedAt = new Date().toISOString();
    payload.privacyPolicyVersion = "2026-09-24";
    payload.termsVersion = "2026-09-24";
    payload.visitAndCollectionAcknowledgement = true;
    payload.fileNames = files.map((f) => ({
      field: f.fieldname,
      name: f.originalname,
      type: f.mimetype,
      size: f.size
    }));

    if (!ref) {
      const created = await createKommoLead(payload);
      ref = { leadId: created.leadId, contactId: created.contactId, submissionId, issuedAt: Date.now() };
    }

    await updateKommoLeadAfterDocuments(payload, ref.leadId);

    let uploadedFiles = [];
    let kommoFileWarning = "";
    try {
      uploadedFiles = await attachFilesToKommoLead(files, ref.leadId);
    } catch (fileError) {
      kommoFileWarning = fileError?.message || "Falha ao anexar documentos no Kommo.";
      console.error("Erro ao anexar documentos no Kommo:", fileError);
    }

    const mailResult = await sendApplicationEmail(payload, files);
    await saveLocalForDevelopment(payload, files);

    res.json({
      ok: true,
      submissionId,
      kommoLeadId: ref.leadId,
      documentsAttachedToKommo: uploadedFiles.length,
      kommoFileWarning: Boolean(kommoFileWarning),
      emailZipAttached: mailResult.attachedZip,
      message: "Solicitação recebida com sucesso."
    });
  } catch (error) {
    console.error("Erro ao concluir solicitação:", error);
    res.status(500).json({
      error: "Não foi possível concluir o envio agora. Seus dados não foram confirmados como recebidos. Tente novamente em instantes."
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
