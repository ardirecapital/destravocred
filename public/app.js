const products = {
  clt: {
    title: "Crédito Pessoal CLT",
    subtitle: "Para trabalhadores com pelo menos 4 meses de registro no emprego atual.",
    amounts: [500, 1000, 1500, 2000],
    installments: {
      500: [{ term: 3, amount: 250 }, { term: 6, amount: 160 }, { term: 9, amount: 135 }, { term: 12, amount: 115 }],
      1000: [{ term: 3, amount: 495 }, { term: 6, amount: 315 }, { term: 9, amount: 265 }, { term: 12, amount: 225 }],
      1500: [{ term: 3, amount: 745 }, { term: 6, amount: 470 }, { term: 9, amount: 395 }, { term: 12, amount: 340 }],
      2000: [{ term: 3, amount: 990 }, { term: 6, amount: 625 }, { term: 9, amount: 525 }, { term: 12, amount: 450 }]
    }
  },
  inss: {
    title: "Crédito Pessoal INSS",
    subtitle: "Para aposentados, pensionistas e beneficiários do BPC/LOAS. Crédito pessoal não consignado.",
    amounts: [500, 1000, 1500, 2000],
    installments: {
      500: [{ term: 3, amount: 250 }, { term: 6, amount: 160 }, { term: 9, amount: 135 }, { term: 12, amount: 115 }, { term: 18, amount: 110 }, { term: 36, amount: 85 }],
      1000: [{ term: 3, amount: 495 }, { term: 6, amount: 315 }, { term: 9, amount: 265 }, { term: 12, amount: 225 }, { term: 18, amount: 220 }, { term: 36, amount: 170 }],
      1500: [{ term: 3, amount: 745 }, { term: 6, amount: 470 }, { term: 9, amount: 395 }, { term: 12, amount: 340 }, { term: 18, amount: 330 }, { term: 36, amount: 255 }],
      2000: [{ term: 3, amount: 990 }, { term: 6, amount: 625 }, { term: 9, amount: 525 }, { term: 12, amount: 450 }, { term: 18, amount: 440 }, { term: 36, amount: 340 }]
    }
  },
  bolsa: {
    title: "Crédito Bolsa Família",
    subtitle: "Para beneficiários do Bolsa Família. Valor máximo de R$ 500.",
    amounts: [500],
    installments: {
      500: [{ term: 3, amount: 250 }, { term: 6, amount: 160 }]
    }
  }
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0
});

let quickProduct = "clt";
let quickSelectedAmount = 500;
let quickSelectedPlan = null;
let selectedProduct = "clt";
let modalSelectedAmount = 500;
let modalSelectedPlan = null;
let cepInfo = null;
let preScreenApproved = false;
let selectedBankStatements = [];

const quickAmountOptions = document.querySelector("#quickAmountOptions");
const quickPlanOptions = document.querySelector("#quickPlanOptions");
const quickSimulationStatus = document.querySelector("#quickSimulationStatus");
const quickSimulate = document.querySelector("#quickSimulate");

const modal = document.querySelector("#simulatorModal");
const modalClose = document.querySelector("#modalClose");
const applicationForm = document.querySelector("#applicationForm");
const productField = document.querySelector("#productField");
const requestedAmountField = document.querySelector("#requestedAmountField");
const selectedTermField = document.querySelector("#selectedTermField");
const installmentAmountField = document.querySelector("#installmentAmountField");
const modalTitle = document.querySelector("#modalTitle");
const modalSubtitle = document.querySelector("#modalSubtitle");
const modalAmountOptions = document.querySelector("#modalAmountOptions");
const modalPlanOptions = document.querySelector("#modalPlanOptions");
const simulationStatus = document.querySelector("#simulationStatus");
const dynamicFields = document.querySelector("#dynamicFields");
const documentFields = document.querySelector("#documentFields");
const preScreenStatus = document.querySelector("#preScreenStatus");
const submitStatus = document.querySelector("#submitStatus");
const privacyConsent = document.querySelector("#privacyConsent");
const consentField = document.querySelector("#consentField");
const leadRefField = document.querySelector("#leadRefField");
const cepInput = document.querySelector("#cepInput");
const cityDisplay = document.querySelector("#cityDisplay");

function setStatus(element, type, message) {
  element.className = `status-box ${type}`;
  element.textContent = message;
}

function clearStatus(element) {
  element.className = "status-box hidden";
  element.textContent = "";
}

function createChoiceButton(label, active, onClick, extraClass = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `choice-button ${extraClass}${active ? " active" : ""}`;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function plansFor(productKey, amount) {
  return products[productKey].installments[String(amount)] || products[productKey].installments[amount] || [];
}

function findPlan(productKey, amount, term) {
  return plansFor(productKey, amount).find(plan => Number(plan.term) === Number(term)) || null;
}

function renderQuickSimulator() {
  const product = products[quickProduct];

  quickAmountOptions.innerHTML = "";
  product.amounts.forEach(amount => {
    quickAmountOptions.appendChild(
      createChoiceButton(
        currency.format(amount),
        amount === quickSelectedAmount,
        () => {
          quickSelectedAmount = amount;
          quickSelectedPlan = null;
          clearStatus(quickSimulationStatus);
          renderQuickSimulator();
        },
        "amount-choice"
      )
    );
  });

  quickPlanOptions.innerHTML = "";
  plansFor(quickProduct, quickSelectedAmount).forEach(plan => {
    const active = quickSelectedPlan?.term === plan.term && quickSelectedPlan?.amount === plan.amount;
    quickPlanOptions.appendChild(
      createChoiceButton(
        `${plan.term}x de ${currency.format(plan.amount)}`,
        active,
        () => {
          quickSelectedPlan = plan;
          clearStatus(quickSimulationStatus);
          renderQuickSimulator();
        },
        "plan-choice"
      )
    );
  });
}

function updateQuickProduct(productKey) {
  if (!products[productKey]) return;
  quickProduct = productKey;
  quickSelectedAmount = products[productKey].amounts[0];
  quickSelectedPlan = null;
  clearStatus(quickSimulationStatus);

  document.querySelectorAll("[data-quick-product]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.quickProduct === productKey);
  });

  renderQuickSimulator();
}

document.querySelectorAll("[data-quick-product]").forEach(btn => {
  btn.addEventListener("click", () => updateQuickProduct(btn.dataset.quickProduct));
});

quickSimulate.addEventListener("click", () => {
  if (!quickSelectedPlan) {
    setStatus(quickSimulationStatus, "error", "Escolha uma opção de pagamento para continuar.");
    return;
  }

  openSimulator(quickProduct, quickSelectedAmount, quickSelectedPlan.term);
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

function renderModalSimulation(preferredTerm = null) {
  const product = products[selectedProduct];

  modalAmountOptions.innerHTML = "";
  product.amounts.forEach(amount => {
    modalAmountOptions.appendChild(
      createChoiceButton(
        currency.format(amount),
        amount === modalSelectedAmount,
        () => {
          modalSelectedAmount = amount;
          modalSelectedPlan = null;
          requestedAmountField.value = String(amount);
          selectedTermField.value = "";
          installmentAmountField.value = "";
          clearStatus(simulationStatus);
          renderModalSimulation();
        },
        "amount-choice"
      )
    );
  });

  modalPlanOptions.innerHTML = "";
  const plans = plansFor(selectedProduct, modalSelectedAmount);

  if (preferredTerm && !modalSelectedPlan) {
    modalSelectedPlan = findPlan(selectedProduct, modalSelectedAmount, preferredTerm);
  }

  plans.forEach(plan => {
    const active = modalSelectedPlan?.term === plan.term && modalSelectedPlan?.amount === plan.amount;
    modalPlanOptions.appendChild(
      createChoiceButton(
        `${plan.term}x de ${currency.format(plan.amount)}`,
        active,
        () => {
          modalSelectedPlan = plan;
          selectedTermField.value = String(plan.term);
          installmentAmountField.value = String(plan.amount);
          clearStatus(simulationStatus);
          renderModalSimulation();
        },
        "plan-choice"
      )
    );
  });

  requestedAmountField.value = String(modalSelectedAmount);
  selectedTermField.value = modalSelectedPlan ? String(modalSelectedPlan.term) : "";
  installmentAmountField.value = modalSelectedPlan ? String(modalSelectedPlan.amount) : "";
}

function openSimulator(productKey, amount, term) {
  if (!products[productKey]) return;

  selectedProduct = productKey;
  preScreenApproved = false;
  selectedBankStatements = [];
  cepInfo = null;
  applicationForm.reset();
  consentField.value = "false";
  leadRefField.value = "";
  cityDisplay.value = "";
  clearStatus(simulationStatus);
  clearStatus(preScreenStatus);
  clearStatus(submitStatus);

  const product = products[productKey];
  productField.value = productKey;
  modalTitle.textContent = product.title;
  modalSubtitle.textContent = product.subtitle;

  const normalizedAmount = Number(amount);
  modalSelectedAmount = product.amounts.includes(normalizedAmount) ? normalizedAmount : product.amounts[0];
  modalSelectedPlan = term ? findPlan(productKey, modalSelectedAmount, term) : null;

  renderModalSimulation(term);
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

document.querySelector("#toPreScreen").addEventListener("click", () => {
  clearStatus(simulationStatus);
  if (!modalSelectedPlan) {
    setStatus(simulationStatus, "error", "Escolha uma opção de pagamento para continuar.");
    return;
  }
  showStep(2);
});

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
    return;
  }

  if (productKey === "inss") {
    dynamicFields.innerHTML = `
      <div class="dynamic-section">
        <div class="form-grid">
          <label>
            Tipo de benefício
            <select name="benefitType" required>
              <option value="">Selecione</option>
              <option value="aposentadoria">Aposentadoria</option>
              <option value="pensao">Pensão por morte</option>
              <option value="bpc_idoso">BPC/LOAS — Idoso</option>
              <option value="bpc_pcd">BPC/LOAS — Pessoa com deficiência</option>
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
    return;
  }

  if (productKey === "bolsa") {
    dynamicFields.innerHTML = `
      <div class="dynamic-section">
        <div class="form-grid">
          <label>
            Valor aproximado do benefício
            <input name="benefitAmount" inputmode="decimal" required>
          </label>
          <label>
            Onde recebe o benefício? <span class="optional-label">(opcional)</span>
            <input name="benefitBank">
          </label>
        </div>
      </div>`;
    return;
  }

  dynamicFields.innerHTML = "";
}

function uploadField(name, label) {
  return `
    <label class="upload-card">
      ${label}
      <input
        type="file"
        name="${name}"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        required
      >
    </label>`;
}

function bankStatementsField() {
  return `
    <div class="upload-card bank-statements-card">
      <label for="bankStatementsInput">Extratos bancários dos últimos 90 dias</label>
      <input
        id="bankStatementsInput"
        type="file"
        name="extratos"
        accept=".pdf,application/pdf"
        multiple
      >
      <div class="selected-files-summary" id="bankStatementsSummary" aria-live="polite">Nenhum arquivo selecionado.</div>
      <div class="selected-files-list" id="bankStatementsList"></div>
      <span class="upload-help">Envie de 1 a 3 arquivos em PDF que, juntos, cubram os últimos 90 dias. Se o banco gerar um único PDF com todo o período, envie apenas esse arquivo. Você pode adicionar os PDFs um de cada vez. Não envie prints ou fotos do extrato.</span>
    </div>`;
}

function bankStatementKey(file) {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function renderBankStatementList() {
  const summary = document.querySelector("#bankStatementsSummary");
  const list = document.querySelector("#bankStatementsList");
  if (!summary || !list) return;

  const count = selectedBankStatements.length;
  summary.textContent = count
    ? `${count} de 3 arquivo${count > 1 ? "s" : ""} selecionado${count > 1 ? "s" : ""}.`
    : "Nenhum arquivo selecionado.";

  list.innerHTML = "";
  selectedBankStatements.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "selected-file-item";

    const name = document.createElement("span");
    name.className = "selected-file-name";
    name.textContent = `✓ ${file.name}`;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "selected-file-remove";
    remove.textContent = "Remover";
    remove.setAttribute("aria-label", `Remover ${file.name}`);
    remove.addEventListener("click", () => {
      selectedBankStatements.splice(index, 1);
      renderBankStatementList();
    });

    item.append(name, remove);
    list.appendChild(item);
  });
}

function setupBankStatementPicker() {
  const input = document.querySelector("#bankStatementsInput");
  if (!input) return;

  input.addEventListener("change", () => {
    const incoming = Array.from(input.files || []);
    const invalid = incoming.find(file => file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"));
    if (invalid) {
      setStatus(submitStatus, "error", "Os extratos bancários devem ser enviados somente em PDF. Não envie prints ou fotos.");
      input.value = "";
      return;
    }

    const known = new Set(selectedBankStatements.map(bankStatementKey));
    for (const file of incoming) {
      if (selectedBankStatements.length >= 3) break;
      const key = bankStatementKey(file);
      if (!known.has(key)) {
        selectedBankStatements.push(file);
        known.add(key);
      }
    }

    if (incoming.length && selectedBankStatements.length >= 3) {
      clearStatus(submitStatus);
    }

    input.value = "";
    renderBankStatementList();
  });

  renderBankStatementList();
}

function renderDocumentFields(productKey) {
  selectedBankStatements = [];

  if (productKey === "clt") {
    documentFields.innerHTML =
      uploadField("identidade", "RG ou CNH") +
      uploadField("residencia", "Comprovante de residência") +
      uploadField("holerite", "Holerite") +
      bankStatementsField();
    setupBankStatementPicker();
    return;
  }

  if (productKey === "inss") {
    const isRepresentative = document.querySelector('[name="isRepresentative"]')?.value === "true";
    documentFields.innerHTML =
      uploadField("identidade", "RG ou CNH do beneficiário") +
      uploadField("residencia", "Comprovante de residência") +
      uploadField("beneficio", "Extrato do benefício do INSS") +
      bankStatementsField() +
      (isRepresentative
        ? uploadField("identidadeRepresentante", "RG ou CNH do representante") +
          uploadField("representacao", "Documento que comprove a representação")
        : "");
    setupBankStatementPicker();
    return;
  }

  if (productKey === "bolsa") {
    documentFields.innerHTML =
      uploadField("identidade", "RG ou CNH") +
      uploadField("residencia", "Comprovante de residência") +
      uploadField("beneficio", "Extrato ou comprovante do benefício Bolsa Família") +
      bankStatementsField();
    setupBankStatementPicker();
    return;
  }

  documentFields.innerHTML = "";
}

function validateBankStatements() {
  if (selectedBankStatements.length < 1 || selectedBankStatements.length > 3) {
    return "Envie de 1 a 3 extratos bancários em PDF que cubram os últimos 90 dias.";
  }

  if (selectedBankStatements.some(file => file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))) {
    return "Os extratos bancários devem ser enviados somente em PDF. Não envie prints ou fotos.";
  }

  return null;
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
    if (months < 4) {
      setStatus(
        preScreenStatus,
        "error",
        "No momento, não conseguimos seguir. Para o Crédito Pessoal CLT é necessário ter pelo menos 4 meses de registro no emprego atual."
      );
      return;
    }
  }

  try {
    setStatus(preScreenStatus, "success", "Validando sua região...");
    cepInfo = await fetchCEPInfo();

    if (!cepInfo.inServiceArea) {
      setStatus(
        preScreenStatus,
        "error",
        "Ainda não atendemos sua cidade. Atualmente atendemos Franca, Restinga, Patrocínio Paulista, Cristais Paulista, Itirapuã, São José da Bela Vista, Cássia e Ibiraci."
      );
      return;
    }

    requestedAmountField.value = String(modalSelectedAmount);
    selectedTermField.value = String(modalSelectedPlan?.term || "");
    installmentAmountField.value = String(modalSelectedPlan?.amount || "");

    setStatus(preScreenStatus, "success", "Pré-análise concluída. Registrando sua solicitação...");

    const preScreenPayload = Object.fromEntries(new FormData(applicationForm).entries());
    const registerResponse = await fetch("/api/prescreen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preScreenPayload)
    });
    const registerData = await registerResponse.json();

    if (!registerResponse.ok) {
      throw new Error(registerData.error || "Não foi possível registrar a pré-análise.");
    }

    leadRefField.value = registerData.leadRef || "";
    preScreenApproved = true;
    const appointmentNote = cepInfo.appointmentOnly
      ? " Para Cássia e Ibiraci, o atendimento presencial ocorre em dias previamente agendados."
      : "";
    setStatus(
      preScreenStatus,
      "success",
      `Pré-análise concluída e solicitação registrada. Agora envie seus documentos para continuarmos a análise.${appointmentNote}`
    );

    setTimeout(() => {
      renderDocumentFields(selectedProduct);
      showStep(3);
    }, 550);
  } catch (error) {
    setStatus(preScreenStatus, "error", error.message);
  }
});


applicationForm.addEventListener("input", (event) => {
  const step2 = event.target.closest?.('[data-step="2"]');
  if (!step2 || event.target === cityDisplay) return;
  if (preScreenApproved || leadRefField.value) {
    preScreenApproved = false;
    leadRefField.value = "";
    clearStatus(preScreenStatus);
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
    setStatus(submitStatus, "error", "É necessário aceitar os Termos de Uso e a Política de Privacidade.");
    return;
  }

  if (!modalSelectedPlan) {
    setStatus(submitStatus, "error", "Selecione uma opção de pagamento antes de enviar a solicitação.");
    return;
  }

  const bankStatementError = validateBankStatements();
  if (bankStatementError) {
    setStatus(submitStatus, "error", bankStatementError);
    return;
  }

  consentField.value = "true";
  requestedAmountField.value = String(modalSelectedAmount);
  selectedTermField.value = String(modalSelectedPlan.term);
  installmentAmountField.value = String(modalSelectedPlan.amount);

  const submitBtn = document.querySelector("#submitApplication");
  submitBtn.disabled = true;
  submitBtn.textContent = "Enviando...";

  try {
    const formData = new FormData(applicationForm);
    formData.delete("extratos");
    selectedBankStatements.forEach(file => formData.append("extratos", file, file.name));

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
      "Solicitação recebida. Nossa equipe continuará a análise com os dados e documentos informados."
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
