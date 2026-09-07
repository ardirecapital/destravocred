const products = {
  clt: {
    title: "Crédito Pessoal CLT",
    subtitle: "Para trabalhadores com pelo menos 6 meses de registro no emprego atual.",
    min: 500,
    max: 2000,
    step: 100
  },
  inss: {
    title: "Crédito Pessoal INSS",
    subtitle: "Para aposentados e pensionistas atendidos em Franca e região.",
    min: 500,
    max: 2000,
    step: 100
  },
  giro: {
    title: "Capital de Giro",
    subtitle: "Para MEIs e pequenas empresas com CNPJ a partir de 6 meses.",
    min: 1000,
    max: 5000,
    step: 500
  },
  veiculo: {
    title: "Crédito com Garantia de Veículo",
    subtitle: "Crédito de até R$ 30 mil, com prazo de até 36 meses, sujeito à análise.",
    min: 5000,
    max: 30000,
    step: 1000
  }
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0
});

let quickProduct = "clt";
let selectedProduct = "clt";
let cepInfo = null;
let preScreenApproved = false;

const quickAmount = document.querySelector("#quickAmount");
const quickAmountLabel = document.querySelector("#quickAmountLabel");
const quickMin = document.querySelector("#quickMin");
const quickMax = document.querySelector("#quickMax");
const quickSimulate = document.querySelector("#quickSimulate");

const modal = document.querySelector("#simulatorModal");
const modalClose = document.querySelector("#modalClose");
const applicationForm = document.querySelector("#applicationForm");
const productField = document.querySelector("#productField");
const requestedAmountField = document.querySelector("#requestedAmountField");
const modalTitle = document.querySelector("#modalTitle");
const modalSubtitle = document.querySelector("#modalSubtitle");
const modalAmount = document.querySelector("#modalAmount");
const modalAmountLabel = document.querySelector("#modalAmountLabel");
const modalMin = document.querySelector("#modalMin");
const modalMax = document.querySelector("#modalMax");
const dynamicFields = document.querySelector("#dynamicFields");
const documentFields = document.querySelector("#documentFields");
const preScreenStatus = document.querySelector("#preScreenStatus");
const submitStatus = document.querySelector("#submitStatus");
const privacyConsent = document.querySelector("#privacyConsent");
const consentField = document.querySelector("#consentField");
const cepInput = document.querySelector("#cepInput");
const cityDisplay = document.querySelector("#cityDisplay");

function setupRange(range, label, minLabel, maxLabel, productKey, initialValue) {
  const p = products[productKey];
  range.min = p.min;
  range.max = p.max;
  range.step = p.step;
  range.value = initialValue ?? p.min;
  label.textContent = currency.format(Number(range.value));
  minLabel.textContent = currency.format(p.min);
  maxLabel.textContent = currency.format(p.max);
}

function updateQuickProduct(productKey) {
  quickProduct = productKey;
  document.querySelectorAll("[data-quick-product]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.quickProduct === productKey);
  });
  setupRange(quickAmount, quickAmountLabel, quickMin, quickMax, productKey);
}

document.querySelectorAll("[data-quick-product]").forEach(btn => {
  btn.addEventListener("click", () => updateQuickProduct(btn.dataset.quickProduct));
});

quickAmount.addEventListener("input", () => {
  quickAmountLabel.textContent = currency.format(Number(quickAmount.value));
});

modalAmount.addEventListener("input", () => {
  modalAmountLabel.textContent = currency.format(Number(modalAmount.value));
  requestedAmountField.value = modalAmount.value;
});

quickSimulate.addEventListener("click", () => {
  openSimulator(quickProduct, Number(quickAmount.value));
});

document.querySelectorAll("[data-open-product]").forEach(btn => {
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    openSimulator(btn.dataset.openProduct);
  });
});

document.querySelector("#menuToggle").addEventListener("click", () => {
  document.querySelector("#mainNav").classList.toggle("open");
});

function openSimulator(productKey, amount) {
  selectedProduct = productKey;
  preScreenApproved = false;
  cepInfo = null;
  applicationForm.reset();
  consentField.value = "false";
  cityDisplay.value = "";
  preScreenStatus.className = "status-box hidden";
  submitStatus.className = "status-box hidden";

  const p = products[productKey];
  productField.value = productKey;
  modalTitle.textContent = p.title;
  modalSubtitle.textContent = p.subtitle;

  setupRange(
    modalAmount,
    modalAmountLabel,
    modalMin,
    modalMax,
    productKey,
    amount && amount >= p.min && amount <= p.max ? amount : p.min
  );

  requestedAmountField.value = modalAmount.value;
  renderDynamicFields(productKey);
  renderDocumentFields(productKey);
  showStep(1);

  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeSimulator() {
  modal.classList.add("hidden");
  document.body.style.overflow = "";
}

modalClose.addEventListener("click", closeSimulator);
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeSimulator();
});

function showStep(step) {
  document.querySelectorAll(".form-step").forEach(section => {
    section.classList.toggle("hidden", Number(section.dataset.step) !== step);
  });
  document.querySelectorAll("[data-progress]").forEach(marker => {
    marker.classList.toggle("active", Number(marker.dataset.progress) <= step);
  });
}

document.querySelector("#toPreScreen").addEventListener("click", () => showStep(2));
document.querySelectorAll("[data-back]").forEach(btn => {
  btn.addEventListener("click", () => showStep(Number(btn.dataset.back)));
});

function renderDynamicFields(productKey) {
  if (productKey === "clt") {
    dynamicFields.innerHTML = `
      <div class="dynamic-section">
        <div class="form-grid">
          <label>
            Empresa onde trabalha
            <input name="employer" required>
          </label>
          <label>
            Há quantos meses está registrado no emprego atual?
            <input name="employmentMonths" type="number" min="0" step="1" required>
          </label>
          <label>
            Renda líquida aproximada
            <input name="netIncome" inputmode="decimal" placeholder="Ex.: 2500">
          </label>
        </div>
      </div>`;
  }

  if (productKey === "inss") {
    dynamicFields.innerHTML = `
      <div class="dynamic-section">
        <div class="form-grid">
          <label>
            Tipo de benefício
            <select name="benefitType" required>
              <option value="">Selecione</option>
              <option>Aposentadoria</option>
              <option>Pensão</option>
              <option>Outro benefício</option>
            </select>
          </label>
          <label>
            Valor aproximado do benefício
            <input name="benefitAmount" inputmode="decimal" required>
          </label>
          <label>
            Há quantos meses recebe o benefício?
            <input name="benefitMonths" type="number" min="0" step="1" required>
          </label>
          <label>
            Banco em que recebe
            <input name="benefitBank" required>
          </label>
          <label>
            Quem está fazendo a solicitação?
            <select name="isRepresentative" id="representativeSelect" required>
              <option value="false">O próprio beneficiário</option>
              <option value="true">Representante legal</option>
            </select>
          </label>
        </div>
      </div>`;

    document.querySelector("#representativeSelect").addEventListener("change", () => {
      renderDocumentFields("inss");
    });
  }

  if (productKey === "giro") {
    dynamicFields.innerHTML = `
      <div class="dynamic-section">
        <div class="form-grid">
          <label>
            CNPJ
            <input name="cnpj" inputmode="numeric" required>
          </label>
          <label>
            Há quantos meses o CNPJ está ativo?
            <input name="cnpjMonths" type="number" min="0" step="1" required>
          </label>
          <label>
            Média mensal de vendas em cartão
            <input name="cardSales" inputmode="decimal" required>
          </label>
        </div>
      </div>`;
  }

  if (productKey === "veiculo") {
    dynamicFields.innerHTML = `
      <div class="dynamic-section">
        <div class="form-grid">
          <label>
            Veículo
            <input name="vehicleModel" placeholder="Marca e modelo" required>
          </label>
          <label>
            Ano do veículo
            <input name="vehicleYear" type="number" min="1980" max="2030" required>
          </label>
        </div>
      </div>`;
  }
}

function uploadField(name, label, multiple = false) {
  return `
    <label class="upload-card">
      ${label}
      <input
        type="file"
        name="${name}"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        ${multiple ? "multiple" : ""}
        required
      >
    </label>`;
}

function renderDocumentFields(productKey) {
  if (productKey === "clt") {
    documentFields.innerHTML =
      uploadField("identidade", "RG ou CNH") +
      uploadField("residencia", "Comprovante de residência") +
      uploadField("holerite", "Holerite") +
      uploadField("extratos", "Extratos bancários dos últimos 3 meses", true);
  }

  if (productKey === "inss") {
    const isRepresentative = document.querySelector('[name="isRepresentative"]')?.value === "true";
    documentFields.innerHTML =
      uploadField("identidade", "RG ou CNH do beneficiário") +
      uploadField("residencia", "Comprovante de residência") +
      uploadField("beneficio", "Extrato do benefício do INSS") +
      (isRepresentative
        ? uploadField("identidadeRepresentante", "RG ou CNH do representante") +
          uploadField("representacao", "Documento que comprove a representação")
        : "");
  }

  if (productKey === "giro") {
    documentFields.innerHTML =
      uploadField("identidade", "RG ou CNH do sócio") +
      uploadField("residencia", "Comprovante de residência") +
      uploadField("extratosPJ", "Extratos bancários PJ dos últimos 3 meses", true) +
      uploadField("cartaoCNPJ", "Cartão CNPJ") +
      uploadField("enderecoEmpresa", "Comprovante de endereço da empresa") +
      uploadField("fachada", "Foto da fachada da empresa");
  }

  if (productKey === "veiculo") {
    documentFields.innerHTML =
      uploadField("identidade", "RG ou CNH") +
      uploadField("residencia", "Comprovante de residência") +
      uploadField("crlv", "CRLV / documento do veículo");
  }
}

function setStatus(element, type, message) {
  element.className = `status-box ${type}`;
  element.textContent = message;
}

function clearStatus(element) {
  element.className = "status-box hidden";
  element.textContent = "";
}

function validateStep2Basics() {
  const requiredInputs = document.querySelectorAll('[data-step="2"] input[required], [data-step="2"] select[required]');
  for (const input of requiredInputs) {
    if (!input.value.trim()) {
      input.focus();
      setStatus(preScreenStatus, "error", "Preencha todos os campos obrigatórios.");
      return false;
    }
  }
  return true;
}

async function fetchCEPInfo() {
  const cep = cepInput.value.replace(/\D/g, "");
  if (cep.length !== 8) throw new Error("Informe um CEP válido com 8 dígitos.");

  const response = await fetch(`/api/cep/${cep}`);
  const data = await response.json();

  if (!response.ok) throw new Error(data.error || "Não foi possível validar o CEP.");
  cityDisplay.value = `${data.city}/${data.state}`;
  return data;
}

document.querySelector("#runPreScreen").addEventListener("click", async () => {
  clearStatus(preScreenStatus);
  preScreenApproved = false;

  if (!validateStep2Basics()) return;

  const fd = new FormData(applicationForm);

  if (selectedProduct === "clt") {
    const months = Number(fd.get("employmentMonths") || 0);
    if (months < 6) {
      setStatus(
        preScreenStatus,
        "error",
        "No momento, não conseguimos seguir. Para o Crédito Pessoal CLT é necessário ter pelo menos 6 meses de registro no emprego atual."
      );
      return;
    }
  }

  if (selectedProduct === "giro") {
    const months = Number(fd.get("cnpjMonths") || 0);
    if (months < 6) {
      setStatus(
        preScreenStatus,
        "error",
        "No momento, não conseguimos seguir. Para o Capital de Giro é necessário que o CNPJ tenha pelo menos 6 meses."
      );
      return;
    }
  }

  try {
    setStatus(preScreenStatus, "success", "Validando sua região...");
    cepInfo = await fetchCEPInfo();

    if (["clt", "inss"].includes(selectedProduct) && !cepInfo.inServiceArea) {
      setStatus(
        preScreenStatus,
        "error",
        "Ainda não atendemos sua região. Atualmente este produto está disponível para Franca/SP e localidades em um raio de até 50 km."
      );
      return;
    }

    preScreenApproved = true;
    setStatus(
      preScreenStatus,
      "success",
      "Você atende aos requisitos iniciais. Agora envie seus documentos para continuarmos a análise."
    );

    setTimeout(() => {
      renderDocumentFields(selectedProduct);
      showStep(3);
    }, 550);
  } catch (error) {
    setStatus(preScreenStatus, "error", error.message);
  }
});

privacyConsent.addEventListener("change", () => {
  consentField.value = privacyConsent.checked ? "true" : "false";
});

applicationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus(submitStatus);

  if (!preScreenApproved) {
    setStatus(submitStatus, "error", "Conclua a pré-análise antes de enviar os documentos.");
    return;
  }

  if (!privacyConsent.checked) {
    setStatus(submitStatus, "error", "É necessário aceitar a política de privacidade.");
    return;
  }

  consentField.value = "true";
  requestedAmountField.value = modalAmount.value;

  const submitBtn = document.querySelector("#submitApplication");
  submitBtn.disabled = true;
  submitBtn.textContent = "Enviando...";

  try {
    const formData = new FormData(applicationForm);

    const response = await fetch("/api/submit", {
      method: "POST",
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Não foi possível enviar a solicitação.");
    }

    setStatus(
      submitStatus,
      "success",
      "Solicitação enviada. Nossa equipe poderá continuar a análise com os dados e documentos informados."
    );

    setTimeout(closeSimulator, 1800);
  } catch (error) {
    setStatus(submitStatus, "error", error.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Enviar solicitação";
  }
});

function maskCPF(value) {
  return value
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function maskCEP(value) {
  return value
    .replace(/\D/g, "")
    .slice(0, 8)
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function maskPhone(value) {
  const clean = value.replace(/\D/g, "").slice(0, 11);
  if (clean.length <= 10) {
    return clean
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return clean
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

document.querySelector("#cpfInput").addEventListener("input", e => e.target.value = maskCPF(e.target.value));
document.querySelector("#phoneInput").addEventListener("input", e => e.target.value = maskPhone(e.target.value));
cepInput.addEventListener("input", e => {
  e.target.value = maskCEP(e.target.value);
  cityDisplay.value = "";
  cepInfo = null;
});

updateQuickProduct("clt");
