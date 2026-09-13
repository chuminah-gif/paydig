/**
 * 연금 계산기 - 공통 계산 로직
 * 아래 계산식은 국민연금법 / 공무원연금법 / 군인연금법 / 사립학교교직원 연금법에
 * 규정된 공식 산정 구조를 단순화하여 근사치를 산출하는 참고용 로직입니다.
 * 실제 급여 결정 기준소득 재평가, 물가상승률 반영, 부양가족연금, 감액/가산 특례 등은
 * 반영되어 있지 않으므로 정확한 수급액은 반드시 해당 연금공단을 통해 확인해야 합니다.
 */

function formatWon(n) {
  var rounded = Math.round(n);
  return rounded.toLocaleString("ko-KR") + "원";
}

function formatManwon(n) {
  return Math.round(n).toLocaleString("ko-KR") + "만원";
}

function clampNonNegative(n) {
  return isFinite(n) && n > 0 ? n : 0;
}

/* -------------------------------------------------------------------------
   국민연금 (National Pension)
   국민연금공단이 공표하는 예상연금월액표(가입기간 × 평균소득월액별 공식 표)의
   실제 수치를 앵커 포인트로 삼아 선형 보간/외삽하는 방식으로 계산합니다.
   각 가입기간(10/20/30/40년) 구간에서 월 수급액은 평균소득월액(B)에 대해
   매우 높은 선형성을 보이므로, 구간별 절편(a)과 기울기(b)를 이용해
   monthly = a(years) + b(years) × B 형태로 근사합니다.
   ------------------------------------------------------------------------- */
function nationalPensionCoefficients(years) {
  // 앵커: (10년, 20년) 구간과 (20년 이상) 구간의 절편(a)·기울기(b)
  var a10 = 171650, b10 = 0.05375;
  var a20 = 257476, b20 = 0.080624;
  var slopeA20plus = 17165, slopeB20plus = 0.005375;

  if (years <= 20) {
    var t = (years - 10) / 10;
    return {
      a: a10 + (a20 - a10) * t,
      b: b10 + (b20 - b10) * t
    };
  }
  return {
    a: a20 + slopeA20plus * (years - 20),
    b: b20 + slopeB20plus * (years - 20)
  };
}

function calcNationalPension(input) {
  var totalMonths = input.years * 12 + input.months;
  var avgIncomeMonthly = input.avgIncomeManwon * 10000; // 만원 -> 원

  if (totalMonths <= 0 || avgIncomeMonthly <= 0) {
    return { error: "가입기간과 평균 소득월액을 올바르게 입력해 주세요." };
  }

  var years = totalMonths / 12;
  var coef = nationalPensionCoefficients(years);
  var monthly = clampNonNegative(coef.a + coef.b * avgIncomeMonthly);

  var eligible = totalMonths >= 120; // 최소 가입기간 10년

  return {
    monthly: monthly,
    yearly: monthly * 12,
    totalMonths: totalMonths,
    eligible: eligible
  };
}

/* -------------------------------------------------------------------------
   국민연금 수급개시연령 (출생연도 기준, 노령연금)
   ------------------------------------------------------------------------- */
function nationalPensionStartAge(birthYear) {
  if (birthYear <= 1952) return 60;
  if (birthYear <= 1956) return 61;
  if (birthYear <= 1960) return 62;
  if (birthYear <= 1964) return 63;
  if (birthYear <= 1968) return 64;
  return 65;
}

/* -------------------------------------------------------------------------
   공무원연금 / 군인연금 / 사학연금 (직역연금 공통 구조)
   연금월액 = 평균기준소득월액 × Σ(재직연도별 적용비율)
   2016년 공무원연금법 개정에 따른 재직기간 1년당 적용비율(신법) 단계적 인하 구조를 근사 반영:
     2015년 이전            : 연 1.9% (구법 단순 근사치)
     2016~2019년            : 1.878% → 1.797% (연 0.027%p씩 단계적 인하)
     2020~2035년            : 1.7% → 1.0% (연 약 0.0467%p씩 단계적 인하)
     2036년 이후             : 1.0% 고정
   군인연금 및 사학연금은 공무원연금 산정방식을 준용하는 구조를 근사 적용합니다.
   ------------------------------------------------------------------------- */
function occupationalAnnualRatePercent(year) {
  if (year <= 2015) return 1.9;
  if (year <= 2019) {
    // 2016: 1.878, 2017: 1.851, 2018: 1.824, 2019: 1.797
    return 1.878 - (year - 2016) * 0.027;
  }
  if (year <= 2035) {
    return 1.7 - (year - 2020) * (0.7 / 15);
  }
  return 1.0;
}

function calcOccupationalPension(input) {
  var totalMonths = input.years * 12 + input.months;
  var avgIncomeMonthly = input.avgIncomeManwon * 10000;

  if (totalMonths <= 0 || avgIncomeMonthly <= 0 || !input.retireYear) {
    return { error: "재직기간, 평균 기준소득월액, 퇴직(예정)연도를 올바르게 입력해 주세요." };
  }

  var serviceYearsFull = totalMonths / 12;
  var startYear = Math.round(input.retireYear - serviceYearsFull);

  var rateSumPercent = 0;
  var yearCount = 0;
  for (var y = startYear; y < input.retireYear; y++) {
    rateSumPercent += occupationalAnnualRatePercent(y);
    yearCount++;
  }
  if (yearCount === 0) {
    rateSumPercent = occupationalAnnualRatePercent(input.retireYear) * serviceYearsFull;
    yearCount = 1;
  }

  // 실제 근무연수(월단위 소수 포함) 비율로 환산
  var avgAnnualRate = rateSumPercent / yearCount;
  var totalRatePercent = avgAnnualRate * serviceYearsFull;

  // 최대 지급률 상한 (근사치: 대략 재직기간 36년 수준에서 포화되는 구조를 단순 반영)
  var cappedRatePercent = Math.min(totalRatePercent, 76.5);

  var monthly = avgIncomeMonthly * (cappedRatePercent / 100);

  var eligible = totalMonths >= 120; // 최소 재직기간 10년 (2016년 이후 임용 기준)

  return {
    monthly: clampNonNegative(monthly),
    yearly: clampNonNegative(monthly) * 12,
    totalMonths: totalMonths,
    ratePercent: cappedRatePercent,
    avgAnnualRate: avgAnnualRate,
    startYear: startYear,
    eligible: eligible
  };
}

/* -------------------------------------------------------------------------
   퇴직연금 DB형 (확정급여형) / 법정 퇴직금
   근로자퇴직급여보장법 기준 근사식: 퇴직급여 ≈ 평균월급 × 근속연수
   (정확히는 1일평균임금×30×(재직일수/365)이지만, 월급을 평균임금으로 보고
   근속연수를 곱하는 표준적인 단순화 방식을 사용합니다.)
   ------------------------------------------------------------------------- */
function calcRetirementDB(input) {
  var avgMonthlyWage = input.avgMonthlyWageManwon * 10000;
  var years = input.years + input.months / 12;

  if (avgMonthlyWage <= 0 || years <= 0) {
    return { error: "평균 월급여와 근속기간을 올바르게 입력해 주세요." };
  }

  var lumpSum = avgMonthlyWage * years;
  var eligible = years >= 1; // 1년 미만 재직 시 퇴직금 지급 의무 없음

  return {
    lumpSum: clampNonNegative(lumpSum),
    years: years,
    eligible: eligible
  };
}

/* -------------------------------------------------------------------------
   투자형 연금 공통 로직 (퇴직연금 DC형 / IRP / 연금저축 / 개인연금)
   매년 일정액을 납입해 지정한 예상 수익률로 복리 운용한다고 가정한
   미래가치(FV) 계산과, 그 금액을 일시금 또는 정해진 기간 동안
   매월 정액으로 나눠 받을 때의 월 수령액(PMT) 계산을 제공합니다.
   ------------------------------------------------------------------------- */
function calcInvestmentAccumulation(input) {
  var initial = input.initialManwon * 10000;
  var annualContribution = input.annualContributionManwon * 10000;
  var years = input.years;
  var rate = input.annualReturnPercent / 100;

  if (years <= 0 || (initial <= 0 && annualContribution <= 0)) {
    return { error: "가입기간과 납입액(또는 초기 자산)을 올바르게 입력해 주세요." };
  }

  var fvInitial = initial * Math.pow(1 + rate, years);
  var fvContributions;
  if (Math.abs(rate) < 1e-9) {
    fvContributions = annualContribution * years;
  } else {
    fvContributions = annualContribution * ((Math.pow(1 + rate, years) - 1) / rate);
  }

  var futureValue = clampNonNegative(fvInitial + fvContributions);

  return {
    futureValue: futureValue,
    years: years,
    annualReturnPercent: input.annualReturnPercent
  };
}

// futureValue를 payoutYears 동안 매월 정액으로 나눠 받을 때의 월 지급액(PMT)
// payoutReturnPercent: 수령 기간 중에도 남은 잔액이 계속 그 수익률로 운용된다는 가정
function calcMonthlyPayout(futureValue, payoutYears, payoutReturnPercent) {
  var months = payoutYears * 12;
  if (months <= 0 || futureValue <= 0) return 0;

  var monthlyRate = (payoutReturnPercent / 100) / 12;
  if (Math.abs(monthlyRate) < 1e-9) {
    return futureValue / months;
  }
  return futureValue * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months));
}

// calcMonthlyPayout의 역함수: 매월 monthlyPayout을 payoutYears 동안 받으려면 은퇴 시점에 필요한 목돈(FV)
function requiredLumpSumForPayout(monthlyPayout, payoutYears, payoutReturnPercent) {
  var months = payoutYears * 12;
  if (months <= 0 || monthlyPayout <= 0) return 0;
  var monthlyRate = (payoutReturnPercent / 100) / 12;
  if (Math.abs(monthlyRate) < 1e-9) return monthlyPayout * months;
  return monthlyPayout * (1 - Math.pow(1 + monthlyRate, -months)) / monthlyRate;
}

// calcInvestmentAccumulation의 역함수: 목표 목돈(targetFV)을 accumulationYears 동안 매년 얼마씩
// 적립해야 하는지 (연 수익률 accumulationReturnPercent, 초기 잔액 0 가정)
function requiredAnnualContribution(targetFV, accumulationYears, accumulationReturnPercent) {
  if (accumulationYears <= 0 || targetFV <= 0) return 0;
  var rate = accumulationReturnPercent / 100;
  if (Math.abs(rate) < 1e-9) return targetFV / accumulationYears;
  return targetFV / ((Math.pow(1 + rate, accumulationYears) - 1) / rate);
}

/* -------------------------------------------------------------------------
   노후설계 대시보드
   통합 시뮬레이션이 "여러 연금을 더하면 총 얼마"까지만 계산한다면, 이 갭
   분석은 그 합계가 지금 소득 대비 충분한지, 부족하면 은퇴 전까지 매달
   얼마를 더 모아야 하는지까지 계산합니다.
   적정 노후생활비 벤치마크(1인 192만원 / 부부 296만원)는 국민연금연구원
   조사 기준으로, 조사 시점에 따라 달라질 수 있는 참고치입니다.
   ------------------------------------------------------------------------- */
var ADEQUATE_LIVING_COST_SINGLE = 1920000;
var ADEQUATE_LIVING_COST_COUPLE = 2960000;

function calcRetirementGap(input) {
  var currentAnnualGross = input.currentAnnualGrossManwon * 10000;
  var projectedMonthly = input.projectedMonthlyManwon * 10000;
  var accumulationYears = input.accumulationYears || 0;
  var accumulationReturnPercent = input.accumulationReturnPercent || 0;
  var payoutYears = input.payoutYears || 20;
  var payoutReturnPercent = input.payoutReturnPercent || 0;
  var household = input.household === "couple" ? "couple" : "single";

  if (currentAnnualGross <= 0 || !(projectedMonthly >= 0)) {
    return { error: "현재 연봉과 예상 은퇴 후 월 수령액을 올바르게 입력해 주세요." };
  }

  var currentNet = calcTakeHomePay(currentAnnualGross / 12, input.pensionType).net;
  var replacementRatio = currentNet > 0 ? (projectedMonthly / currentNet) * 100 : 0;

  var livingCostBenchmark = household === "couple" ? ADEQUATE_LIVING_COST_COUPLE : ADEQUATE_LIVING_COST_SINGLE;
  var gapVsBenchmark = livingCostBenchmark - projectedMonthly; // 양수면 부족

  var requiredMonthlySavings = 0;
  if (gapVsBenchmark > 0 && accumulationYears > 0) {
    var neededLumpSum = requiredLumpSumForPayout(gapVsBenchmark, payoutYears, payoutReturnPercent);
    requiredMonthlySavings = requiredAnnualContribution(neededLumpSum, accumulationYears, accumulationReturnPercent) / 12;
  }

  return {
    currentNet: currentNet,
    projectedMonthly: projectedMonthly,
    replacementRatio: replacementRatio,
    household: household,
    livingCostBenchmark: livingCostBenchmark,
    gapVsBenchmark: gapVsBenchmark,
    requiredMonthlySavings: requiredMonthlySavings
  };
}

/* -------------------------------------------------------------------------
   세금 계산 (참고용 근사치)
   국세청 고시 세율표(2023.1.1 이후 근속연수공제/환산급여공제, 종합소득세
   기본세율)와 연금소득공제표, 사적연금 원천징수세율을 기준으로 계산합니다.
   실제 세액은 다른 소득 유무, 각종 소득/세액공제 등에 따라 달라지므로
   참고용 추정치이며, 정확한 금액은 국세청 홈택스 또는 세무사를 통해
   확인해야 합니다.
   ------------------------------------------------------------------------- */

// 종합소득세 기본세율 (누진공제 포함, 지방소득세 별도)
function progressiveIncomeTax(base) {
  base = clampNonNegative(base);
  if (base <= 14000000) return base * 0.06;
  if (base <= 50000000) return base * 0.15 - 1260000;
  if (base <= 88000000) return base * 0.24 - 5760000;
  if (base <= 150000000) return base * 0.35 - 15440000;
  if (base <= 300000000) return base * 0.38 - 19940000;
  if (base <= 500000000) return base * 0.40 - 25940000;
  if (base <= 1000000000) return base * 0.42 - 35940000;
  return base * 0.45 - 65940000;
}

// 공적연금소득세 근사 (국민연금·직역연금이 유일한 소득이라고 가정한 단순 추정)
function calcPublicPensionTax(annualPensionWon) {
  var w = clampNonNegative(annualPensionWon);
  var deduction;
  if (w <= 3500000) deduction = w;
  else if (w <= 7000000) deduction = 3500000 + (w - 3500000) * 0.4;
  else if (w <= 14000000) deduction = 4900000 + (w - 7000000) * 0.2;
  else deduction = 6300000 + (w - 14000000) * 0.1;
  deduction = Math.min(deduction, 9000000);

  var pensionIncome = clampNonNegative(w - deduction);
  var basicDeduction = 1500000; // 본인 기본공제만 반영 (단순화)
  var taxBase = clampNonNegative(pensionIncome - basicDeduction);
  var incomeTax = progressiveIncomeTax(taxBase);
  var totalTax = clampNonNegative(incomeTax * 1.1); // 지방소득세 10% 포함

  return { annualTax: totalTax, monthlyTax: totalTax / 12 };
}

// 퇴직소득세 (근속연수공제 → 환산급여 → 환산급여공제 → 세율 적용, 지방소득세 포함)
function calcRetirementIncomeTax(lumpSum, years) {
  lumpSum = clampNonNegative(lumpSum);
  years = Math.max(1, Math.round(years));

  var serviceDeduction;
  if (years <= 5) serviceDeduction = years * 1000000;
  else if (years <= 10) serviceDeduction = 5000000 + (years - 5) * 2000000;
  else if (years <= 20) serviceDeduction = 15000000 + (years - 10) * 2500000;
  else serviceDeduction = 40000000 + (years - 20) * 3000000;

  var afterServiceDeduction = clampNonNegative(lumpSum - serviceDeduction);
  var convertedWage = (afterServiceDeduction / years) * 12;

  var wageDeduction;
  if (convertedWage <= 8000000) wageDeduction = convertedWage;
  else if (convertedWage <= 70000000) wageDeduction = 8000000 + (convertedWage - 8000000) * 0.6;
  else if (convertedWage <= 100000000) wageDeduction = 45200000 + (convertedWage - 70000000) * 0.55;
  else if (convertedWage <= 300000000) wageDeduction = 61700000 + (convertedWage - 100000000) * 0.45;
  else wageDeduction = 151700000 + (convertedWage - 300000000) * 0.35;

  var taxBase = clampNonNegative(convertedWage - wageDeduction);
  var annualizedTax = progressiveIncomeTax(taxBase);
  var retirementTax = (annualizedTax / 12) * years;
  var totalTax = clampNonNegative(retirementTax * 1.1); // 지방소득세 10% 포함

  return { tax: totalTax, effectiveRate: lumpSum > 0 ? totalTax / lumpSum : 0 };
}

// 퇴직연금을 "연금" 형태로 수령할 때의 퇴직소득세 감면 (수령 1~10년차 30%, 11년차 이후 40% 감면)
function retirementPensionTaxDiscountRate(payoutYears) {
  return payoutYears <= 10 ? 0.3 : 0.4;
}

// 사적연금소득세 (연금저축·IRP를 "연금" 형태로 수령 시, 연 1,500만원 이하 분리과세 가정)
function privatePensionTaxRate(age) {
  if (age >= 80) return 0.033;
  if (age >= 70) return 0.044;
  return 0.055; // 55~69세
}

// 이자소득세 (개인연금보험 등 10년 미만 유지 시 차익 부분에 과세, 지방소득세 포함)
var INTEREST_INCOME_TAX_RATE = 0.154;

// 공적연금(국민연금·직역연금) 세전/세후 표 행 HTML
function publicPensionTaxRowsHtml(monthly) {
  var tax = calcPublicPensionTax(monthly * 12);
  var afterTax = clampNonNegative(monthly - tax.monthlyTax);
  return (
    '<tr><th>세전 월 수급액</th><td>' + formatWon(monthly) + '</td></tr>' +
    '<tr><th>예상 세금 (연금소득세, 단독소득 가정)</th><td>-' + formatWon(tax.monthlyTax) + '</td></tr>' +
    '<tr><th>세후 실수령액 (추정)</th><td><strong>' + formatWon(afterTax) + '</strong></td></tr>'
  );
}

// IRP·연금저축 공통: 세전/세후 결과 표 HTML (세액공제받은 사적연금 기준)
// 연금형 수령: 나이별 연금소득세(3.3~5.5%). 일시금 수령: 기타소득세 16.5% 근사 적용(지방소득세 포함).
function privatePensionResultTableHtml(futureValue, years, annualReturnPercent, payoutType, payoutYears, returnRate, startAge) {
  var html = '<table class="result-table">';
  html += '<tr><th>운용 기간</th><td>' + years + '년</td></tr>';
  html += '<tr><th>적용 수익률</th><td>연 ' + annualReturnPercent + '%</td></tr>';

  if (payoutType === "monthly" && payoutYears > 0) {
    var monthly = calcMonthlyPayout(futureValue, payoutYears, returnRate);
    var rate = privatePensionTaxRate(startAge || 55);
    var monthlyAfterTax = monthly * (1 - rate);
    html += '<tr><th>연금소득세율 (만 ' + (startAge || 55) + '세 기준)</th><td>' + (rate * 100).toFixed(1) + '%</td></tr>';
    html += '<tr><th>세후 월 지급액 (추정)</th><td><strong>' + formatWon(monthlyAfterTax) + '</strong></td></tr>';
  } else {
    var otherIncomeTaxRate = 0.165;
    var afterTax = futureValue * (1 - otherIncomeTaxRate);
    html += '<tr><th>기타소득세 (일시금 수령, 지방소득세 포함 약 16.5%)</th><td>-' + formatWon(futureValue * otherIncomeTaxRate) + '</td></tr>';
    html += '<tr><th>세후 실수령액 (추정)</th><td><strong>' + formatWon(afterTax) + '</strong></td></tr>';
  }
  html += '</table>';
  return html;
}

/* -------------------------------------------------------------------------
   폼 유틸리티
   ------------------------------------------------------------------------- */
function getNumberValue(id) {
  var el = document.getElementById(id);
  if (!el) return NaN;
  var v = parseFloat(el.value);
  return isNaN(v) ? 0 : v;
}

function showError(panelId, message) {
  var panel = document.getElementById(panelId);
  panel.innerHTML =
    '<div class="error-box">⚠ ' + message + "</div>" +
    '<div class="result-empty"><div class="icon">🧮</div><p>입력값을 확인한 뒤 다시 계산해 주세요.</p></div>';
}

/* -------------------------------------------------------------------------
   4대보험 · 실수령액 · 최저시급 · 실업급여 (페이딕 확장분)
   요율은 2026년 기준(국민연금 9.5%/건강보험 7.19%/장기요양보험은
   건강보험료의 13.14%/고용보험 1.8%, 각 총액 기준 — 근로자는 절반
   부담)이며, 매년 고시되는 값이므로 실제 급여명세서와 차이가 있을 수
   있는 참고용 추정치입니다.
   ------------------------------------------------------------------------- */

var RATE_NATIONAL_PENSION = 0.0475;      // 국민연금 (근로자 부담분, 2026)
var RATE_HEALTH_INSURANCE = 0.03595;     // 건강보험 (근로자 부담분, 2026)
var RATE_LONG_TERM_CARE_OF_PREMIUM = 0.1314; // 장기요양보험료율(2026) — 급여가 아닌 "건강보험료(본인부담분)"에 곱하는 비율
var RATE_EMPLOYMENT_INSURANCE = 0.009;   // 고용보험 실업급여 (근로자 부담분, 2026)
var MINIMUM_WAGE_2026 = 10320;           // 2026년 최저시급(원)
var UNEMPLOYMENT_DAILY_CAP_2026 = 66000; // 구직급여 상한액(참고치, 고용노동부 매년 고시)

/* 공적연금 종류별 개인부담 기여율. 공무원·사학·군인연금 가입자는 국민연금 대신
   각자의 직역연금에 가입하며, 국민연금에 가입할 수 없는 직역연금 가입자·별정우체국
   직원은 고용보험 가입 대상에서도 제외됩니다(근로복지공단 안내 기준). */
var PENSION_TYPES = {
  national: { label: "국민연금 (일반 근로자)", rate: 0.0475, employmentInsurance: true },
  civilServant: { label: "공무원연금", rate: 0.09, employmentInsurance: false },
  privateSchool: { label: "사학연금", rate: 0.09, employmentInsurance: false },
  military: { label: "군인연금", rate: 0.07, employmentInsurance: false }
};

function calcInsuranceBreakdown(monthlyGrossWon, pensionType) {
  var m = clampNonNegative(monthlyGrossWon);
  var plan = PENSION_TYPES[pensionType] || PENSION_TYPES.national;
  var np = m * plan.rate;
  var hi = m * RATE_HEALTH_INSURANCE;
  var ltc = hi * RATE_LONG_TERM_CARE_OF_PREMIUM; // 급여가 아니라 건강보험료(본인부담분)에 곱함
  var ei = plan.employmentInsurance ? m * RATE_EMPLOYMENT_INSURANCE : 0;
  return {
    pensionType: pensionType,
    pensionLabel: plan.label,
    employmentInsuranceApplicable: plan.employmentInsurance,
    nationalPension: np,
    healthInsurance: hi,
    longTermCare: ltc,
    employmentInsurance: ei,
    total: np + hi + ltc + ei
  };
}

// 근로소득공제 (국세청 고시 근로소득공제표, 총급여 기준 — 세율표와 달리 매년 잘 바뀌지 않는 안정적인 구조)
function laborIncomeDeduction(annualGrossWon) {
  var g = clampNonNegative(annualGrossWon);
  if (g <= 5000000) return g * 0.7;
  if (g <= 15000000) return 3500000 + (g - 5000000) * 0.4;
  if (g <= 45000000) return 7500000 + (g - 15000000) * 0.15;
  if (g <= 100000000) return 12000000 + (g - 45000000) * 0.05;
  return 14750000 + (g - 100000000) * 0.02;
}

// 월 소득세·지방소득세 근사 (근로소득공제 → 근로소득금액 → 기본공제(본인만, 단순화) → 종합소득세 기본세율)
function calcMonthlyIncomeTax(monthlyGrossWon) {
  var annualGross = clampNonNegative(monthlyGrossWon) * 12;
  var deduction = laborIncomeDeduction(annualGross);
  var laborIncome = clampNonNegative(annualGross - deduction);
  var basicDeduction = 1500000; // 본인 기본공제만 반영 (배우자·부양가족 공제 등은 미반영)
  var taxBase = clampNonNegative(laborIncome - basicDeduction);
  var annualTax = progressiveIncomeTax(taxBase);
  var incomeTax = clampNonNegative(annualTax / 12);
  var localTax = incomeTax * 0.1; // 지방소득세 = 소득세의 10% (법정 비율)
  return { incomeTax: incomeTax, localTax: localTax };
}

// 연봉 실수령액 (정방향): 월 급여(세전) -> 4대보험·세금 상세 + 월 실수령액
function calcTakeHomePay(monthlyGrossWon, pensionType) {
  var m = clampNonNegative(monthlyGrossWon);
  if (m <= 0) return { error: "월 급여(세전)를 올바르게 입력해 주세요." };
  var insurance = calcInsuranceBreakdown(m, pensionType);
  var tax = calcMonthlyIncomeTax(m);
  var totalDeduct = insurance.total + tax.incomeTax + tax.localTax;
  return {
    monthlyGross: m,
    insurance: insurance,
    tax: tax,
    totalDeduct: totalDeduct,
    net: clampNonNegative(m - totalDeduct)
  };
}

// 연봉 실수령액 (역산): 목표 월 실수령액 -> 필요한 세전 월급여 (이분 탐색)
// 공제액이 급여 구간(누진세율)에 따라 완전한 선형함수가 아니므로 근사적으로 이분 탐색을 사용합니다.
function solveGrossFromNet(targetMonthlyNetWon, pensionType) {
  var target = clampNonNegative(targetMonthlyNetWon);
  if (target <= 0) return { error: "목표 월 실수령액을 올바르게 입력해 주세요." };
  var lo = 0, hi = 500000000;
  for (var i = 0; i < 60; i++) {
    var mid = (lo + hi) / 2;
    var net = calcTakeHomePay(mid, pensionType).net;
    if (net < target) lo = mid; else hi = mid;
  }
  return calcTakeHomePay((lo + hi) / 2, pensionType);
}

/* -------------------------------------------------------------------------
   최저시급 계산기
   주 15시간 이상 근무 시 주휴수당(법정 최대 8시간/주)을 포함해 계산합니다.
   ------------------------------------------------------------------------- */
function calcMinimumWage(input) {
  var hourly = input.hourlyWage > 0 ? input.hourlyWage : MINIMUM_WAGE_2026;
  var weeklyHours = input.weeklyHours;
  if (!(weeklyHours > 0)) return { error: "주 근로시간을 올바르게 입력해 주세요." };

  var weeklyHolidayHours = weeklyHours >= 15 ? Math.min(weeklyHours, 40) / 5 : 0;
  var weeklyPay = hourly * (weeklyHours + weeklyHolidayHours);
  var monthlyPay = weeklyPay * (365 / 7 / 12);

  return {
    hourly: hourly,
    weeklyHours: weeklyHours,
    weeklyHolidayHours: weeklyHolidayHours,
    weeklyPay: weeklyPay,
    monthlyPay: monthlyPay,
    belowMinimum: hourly < MINIMUM_WAGE_2026,
    minimumWage: MINIMUM_WAGE_2026
  };
}

/* -------------------------------------------------------------------------
   고용보험 실업급여 (구직급여) 계산기
   소정급여일수는 고용보험법 시행령 별표1 기준(안정적으로 유지되는 법정 표)을 그대로 반영.
   ------------------------------------------------------------------------- */
function unemploymentBenefitDays(insuredYears, age) {
  var bracket;
  if (insuredYears < 1) bracket = 0;
  else if (insuredYears < 3) bracket = 1;
  else if (insuredYears < 5) bracket = 2;
  else if (insuredYears < 10) bracket = 3;
  else bracket = 4;
  var under50 = [120, 150, 180, 210, 240];
  var over50 = [120, 180, 210, 240, 270];
  return (age >= 50 ? over50 : under50)[bracket];
}

function calcUnemploymentBenefit(input) {
  var avgMonthlyWon = input.avgMonthlyWageManwon * 10000;
  if (avgMonthlyWon <= 0 || !(input.insuredYears >= 0) || !input.age) {
    return { error: "이직 전 평균 월급여, 고용보험 가입기간, 연령을 올바르게 입력해 주세요." };
  }
  var avgDailyWage = avgMonthlyWon / 30; // 평균임금 산정을 30일 기준으로 단순화한 근사치
  var dailyBenefit = Math.min(avgDailyWage * 0.6, UNEMPLOYMENT_DAILY_CAP_2026);
  var days = unemploymentBenefitDays(input.insuredYears, input.age);
  return { dailyBenefit: dailyBenefit, days: days, total: dailyBenefit * days };
}

/* 4대보험·실수령액류 계산기 공통: 상세 내역 HTML */
function insuranceDeductDetailHtml(insurance, tax) {
  var pensionLabel = insurance.pensionLabel || "국민연금";
  var html = '<div class="deduct-detail">';
  html += '<div class="d-group-label">4대보험</div>';
  html += '<div class="d-row"><span>' + pensionLabel + '</span><span>' + formatWon(insurance.nationalPension) + '</span></div>';
  html += '<div class="d-row"><span>건강보험</span><span>' + formatWon(insurance.healthInsurance) + '</span></div>';
  html += '<div class="d-row"><span>장기요양보험</span><span>' + formatWon(insurance.longTermCare) + '</span></div>';
  if (insurance.employmentInsuranceApplicable === false) {
    html += '<div class="d-row"><span>고용보험</span><span>해당없음</span></div>';
  } else {
    html += '<div class="d-row"><span>고용보험</span><span>' + formatWon(insurance.employmentInsurance) + '</span></div>';
  }
  if (tax) {
    html += '<div class="d-group-label">세금</div>';
    html += '<div class="d-row"><span>소득세</span><span>' + formatWon(tax.incomeTax) + '</span></div>';
    html += '<div class="d-row"><span>지방소득세</span><span>' + formatWon(tax.localTax) + '</span></div>';
  }
  var total = insurance.total + (tax ? tax.incomeTax + tax.localTax : 0);
  html += '<div class="d-row total"><span>공제 합계</span><span>' + formatWon(total) + '</span></div>';
  html += '</div>';
  return html;
}

/* -------------------------------------------------------------------------
   퇴직금 계산기 (근로기준법 기준 평균임금 방식)
   근로자퇴직급여보장법: 퇴직금 = 1일 평균임금 × 30 × (재직일수 / 365)
   평균임금 = 퇴직 전 3개월간 임금총액 ÷ 그 기간의 총 일수
   기존 calcRetirementDB(월급×근속연수 단순화)보다 정확한 방식을 사용합니다.
   ------------------------------------------------------------------------- */
function calcSeverancePay(input) {
  var last3MonthsWage = input.last3MonthsWageManwon * 10000;
  var serviceDays = input.serviceDays;
  if (last3MonthsWage <= 0 || !(serviceDays > 0)) {
    return { error: "최근 3개월 임금총액과 재직기간을 올바르게 입력해 주세요." };
  }
  if (serviceDays < 365) {
    return { error: "퇴직금은 계속근로기간 1년(365일) 이상부터 지급 의무가 발생합니다.", eligible: false, serviceDays: serviceDays };
  }
  var avgDailyWage = last3MonthsWage / 91; // 3개월을 평균 91일로 근사
  var severance = avgDailyWage * 30 * (serviceDays / 365);
  var years = serviceDays / 365;
  var tax = calcRetirementIncomeTax(severance, years);
  return {
    avgDailyWage: avgDailyWage,
    severance: clampNonNegative(severance),
    years: years,
    tax: tax.tax,
    afterTax: clampNonNegative(severance - tax.tax),
    eligible: true
  };
}

/* -------------------------------------------------------------------------
   프리랜서(사업소득) 3.3% 원천징수 계산기
   소득세 3% + 지방소득세 0.3% = 총 3.3%를 지급자가 원천징수 후 나머지를 지급합니다.
   실제 세부담은 다음 해 5월 종합소득세 신고 때 확정되며, 3.3%는 예납 성격입니다.
   ------------------------------------------------------------------------- */
var FREELANCER_WITHHOLDING_RATE = 0.033;

function calcFreelancerTax(grossWon) {
  var g = clampNonNegative(grossWon);
  if (g <= 0) return { error: "용역대가(계약금액)를 올바르게 입력해 주세요." };
  var incomeTax = g * 0.03;
  var localTax = g * 0.003;
  return { gross: g, incomeTax: incomeTax, localTax: localTax, withheld: incomeTax + localTax, net: g - incomeTax - localTax };
}

function solveFreelancerGrossFromNet(targetNetWon) {
  var target = clampNonNegative(targetNetWon);
  if (target <= 0) return { error: "원하는 실수령액을 올바르게 입력해 주세요." };
  var gross = target / (1 - FREELANCER_WITHHOLDING_RATE);
  return calcFreelancerTax(gross);
}

/* -------------------------------------------------------------------------
   주휴수당 계산기 (calcMinimumWage와 동일한 로직을 재사용하는 전용 진입점)
   ------------------------------------------------------------------------- */
function calcWeeklyHolidayPay(input) {
  var hourly = input.hourlyWage > 0 ? input.hourlyWage : MINIMUM_WAGE_2026;
  var weeklyHours = input.weeklyHours;
  if (!(weeklyHours > 0)) return { error: "주 근로시간을 올바르게 입력해 주세요." };
  if (weeklyHours < 15) {
    return { eligible: false, weeklyHours: weeklyHours };
  }
  var holidayHours = Math.min(weeklyHours, 40) / 5;
  return { eligible: true, hourly: hourly, weeklyHours: weeklyHours, holidayHours: holidayHours, holidayPay: hourly * holidayHours };
}

/* -------------------------------------------------------------------------
   연차유급휴가 계산기 (근로기준법 제60조)
   1년 미만: 1개월 개근 시 1일씩 발생 (최대 11일)
   1년 이상: 기본 15일 + 최초 1년 초과 매 2년마다 1일 가산 (최대 25일)
   ------------------------------------------------------------------------- */
function annualLeaveDays(serviceYears) {
  if (serviceYears < 1) return Math.min(11, Math.floor(serviceYears * 12));
  var bonus = Math.floor((serviceYears - 1) / 2);
  return Math.min(25, 15 + bonus);
}

function calcAnnualLeave(input) {
  var serviceYears = input.serviceYears;
  var monthlyWageWon = input.monthlyWageManwon * 10000;
  var usedDays = input.usedDays || 0;
  if (!(serviceYears >= 0) || monthlyWageWon <= 0) {
    return { error: "근속기간과 월급을 올바르게 입력해 주세요." };
  }
  var totalDays = annualLeaveDays(serviceYears);
  var unusedDays = clampNonNegative(totalDays - usedDays);
  var dailyOrdinaryWage = (monthlyWageWon / 209) * 8; // 통상임금 근사(월 소정근로시간 209시간 기준)
  var allowance = dailyOrdinaryWage * unusedDays;
  return { totalDays: totalDays, usedDays: usedDays, unusedDays: unusedDays, dailyOrdinaryWage: dailyOrdinaryWage, allowance: allowance };
}

/* -------------------------------------------------------------------------
   육아휴직급여 계산기 (2026년 기준, 사후지급금 폐지 · 매월 전액 지급)
   1~3개월차: 통상임금 100%, 상한 250만원 / 4~6개월차: 100%, 상한 200만원
   7개월차 이후: 통상임금 80%, 상한 160만원
   "6+6 부모육아휴직제"(부모 동시·순차 사용 시 첫 6개월 상한 대폭 상향)는
   별도 특례로, 이 계산기에는 반영되어 있지 않습니다.
   ------------------------------------------------------------------------- */
var PARENTAL_LEAVE_LOWER_BOUND = 700000; // 하한액(참고치)

function parentalLeaveMonthlyPay(monthlyOrdinaryWageWon, monthIndex) {
  var rate, cap;
  if (monthIndex <= 3) { rate = 1.0; cap = 2500000; }
  else if (monthIndex <= 6) { rate = 1.0; cap = 2000000; }
  else { rate = 0.8; cap = 1600000; }
  var pay = monthlyOrdinaryWageWon * rate;
  pay = Math.min(pay, cap);
  pay = Math.max(pay, Math.min(PARENTAL_LEAVE_LOWER_BOUND, monthlyOrdinaryWageWon));
  return pay;
}

function calcParentalLeavePay(input) {
  var monthlyWageWon = input.monthlyWageManwon * 10000;
  var months = input.months;
  if (monthlyWageWon <= 0 || !(months > 0)) {
    return { error: "통상임금(월급)과 육아휴직 사용 개월 수를 올바르게 입력해 주세요." };
  }
  var rows = [];
  var total = 0;
  for (var m = 1; m <= months; m++) {
    var pay = parentalLeaveMonthlyPay(monthlyWageWon, m);
    rows.push({ month: m, pay: pay });
    total += pay;
  }
  return { rows: rows, total: total, months: months };
}

/* -------------------------------------------------------------------------
   산재보험료 · 휴업급여 계산기
   - 산재보험료: 전액 사업주 부담. 업종별 요율(대표 업종 예시, 2026년 근사치) × 보수총액
   - 휴업급여: 요양으로 일하지 못한 기간 중 평균임금의 70%를 1일 단위로 지급
     (저소득 근로자는 평균임금의 90%·최저임금 일급 한도까지 상향 보장하는 특례가 있어
     이 계산기는 그 취지를 반영한 단순화된 하한을 적용합니다)
   - 요양급여(치료비)는 실비 지급이 원칙이라 사전에 금액을 계산할 수 있는 항목이
     아니므로 이 계산기에는 포함하지 않았습니다. 아래 안내문 참고.
   ------------------------------------------------------------------------- */
var INDUSTRIAL_ACCIDENT_RATES = {
  office: { label: "사무직(금융·보험 등)", rate: 0.007 },
  retail: { label: "도소매·음식숙박업", rate: 0.009 },
  manufacturing: { label: "제조업(일반)", rate: 0.015 },
  transport: { label: "운수·창고·통신업", rate: 0.018 },
  construction: { label: "건설업", rate: 0.035 }
};

var MINIMUM_WAGE_DAILY_2026 = MINIMUM_WAGE_2026 * 8; // 82,560원

function calcIndustrialAccidentPremium(input) {
  var totalWageWon = input.totalWageManwon * 10000;
  var industry = INDUSTRIAL_ACCIDENT_RATES[input.industry];
  if (totalWageWon <= 0 || !industry) {
    return { error: "보수총액과 업종을 올바르게 입력해 주세요." };
  }
  return { industryLabel: industry.label, rate: industry.rate, premium: totalWageWon * industry.rate };
}

function calcWorkInjuryLeaveBenefit(input) {
  var last3MonthsWage = input.last3MonthsWageManwon * 10000;
  var leaveDays = input.leaveDays;
  if (last3MonthsWage <= 0 || !(leaveDays > 0)) {
    return { error: "최근 3개월 임금총액과 요양(휴업) 일수를 올바르게 입력해 주세요." };
  }
  var avgDailyWage = last3MonthsWage / 91;
  var basic = avgDailyWage * 0.7;
  var guaranteed = Math.min(avgDailyWage * 0.9, MINIMUM_WAGE_DAILY_2026);
  var dailyBenefit = Math.max(basic, guaranteed);
  return { avgDailyWage: avgDailyWage, dailyBenefit: dailyBenefit, leaveDays: leaveDays, total: dailyBenefit * leaveDays };
}

/* -------------------------------------------------------------------------
   연말정산 예상세액 계산기
   총급여 -> 근로소득공제 -> 근로소득금액 -> 인적공제·4대보험료(특별소득공제) ->
   과세표준 -> 산출세액 -> 근로소득세액공제·연금계좌세액공제 -> 결정세액
   국세청 고시 근로소득세액공제 한도표, 연금계좌세액공제율(16.5%/13.2%, 900만원
   한도)은 최근 몇 년간 안정적으로 유지되어 온 구조를 그대로 반영했습니다.
   신용카드 사용액, 의료비, 월세 등 그 밖의 공제 항목은 반영되어 있지 않습니다.
   ------------------------------------------------------------------------- */
function laborIncomeTaxCredit(computedTax, totalGrossWon) {
  var credit = computedTax <= 500000 ? computedTax * 0.55 : 275000 + (computedTax - 500000) * 0.3;

  var cap;
  if (totalGrossWon <= 33000000) cap = 740000;
  else if (totalGrossWon <= 70000000) cap = Math.max(660000, 740000 - (totalGrossWon - 33000000) * 0.008);
  else cap = Math.max(500000, 660000 - (totalGrossWon - 70000000) * 0.5);

  return Math.min(credit, cap);
}

function pensionAccountTaxCredit(contributionWon, totalGrossWon) {
  var capped = Math.min(contributionWon, 9000000);
  var rate = totalGrossWon <= 55000000 ? 0.165 : 0.132;
  return capped * rate;
}

function calcYearEndTax(input) {
  var totalGross = input.totalGrossManwon * 10000;
  var dependents = input.dependents || 0;
  var pensionContribution = (input.pensionContributionManwon || 0) * 10000;
  var withheldTax = (input.withheldTaxManwon || 0) * 10000;

  if (totalGross <= 0) return { error: "연간 총급여를 올바르게 입력해 주세요." };

  var laborDeduction = laborIncomeDeduction(totalGross);
  var laborIncome = clampNonNegative(totalGross - laborDeduction);

  var personalDeduction = (1 + dependents) * 1500000;
  var insuranceAnnual = calcInsuranceBreakdown(totalGross / 12, "national").total * 12;

  var taxBase = clampNonNegative(laborIncome - personalDeduction - insuranceAnnual);
  var computedTax = progressiveIncomeTax(taxBase);

  var earnedIncomeCredit = laborIncomeTaxCredit(computedTax, totalGross);
  var pensionCredit = pensionAccountTaxCredit(pensionContribution, totalGross);

  var finalTax = clampNonNegative(computedTax - earnedIncomeCredit - pensionCredit);
  var finalLocalTax = finalTax * 0.1;
  var finalTotal = finalTax + finalLocalTax;

  var withheldLocalTax = withheldTax * 0.1;
  var withheldTotal = withheldTax + withheldLocalTax;

  return {
    totalGross: totalGross,
    laborDeduction: laborDeduction,
    laborIncome: laborIncome,
    personalDeduction: personalDeduction,
    insuranceAnnual: insuranceAnnual,
    taxBase: taxBase,
    computedTax: computedTax,
    earnedIncomeCredit: earnedIncomeCredit,
    pensionCredit: pensionCredit,
    finalTax: finalTax,
    finalLocalTax: finalLocalTax,
    finalTotal: finalTotal,
    withheldTotal: withheldTotal,
    hasWithheld: withheldTax > 0,
    refundOrDue: withheldTotal - finalTotal // 양수면 환급, 음수면 추가 납부
  };
}
