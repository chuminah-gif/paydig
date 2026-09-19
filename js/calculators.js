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
   국민연금공단 '2026년 예상연금월액표'(2026.1, A값 3,193,511원)와 같은 산식으로 계산합니다.
     기본연금액(월) = 1.29 × (A + B) × (가입연수 ÷ 20) ÷ 12  = 0.005375 × (A + B) × 가입연수
     · A : 연금 수급 직전 3년간 전체 가입자 평균소득월액의 평균 (2026년 3,193,511원)
     · B : 본인 가입기간 중 기준소득월액 평균(재평가)  · 10~20년 지급률 50%+연 5%p, 20년 초과분 연 5%p 가산과 동일한 식
     · 연금액은 본인 기준소득월액 평균(B)을 넘을 수 없음(공단 표 하단 주의사항)
   공단 표의 10·15·20·25·30·35·40년, B 100~600만원 값과 일치하는 것을 확인했습니다.
   ------------------------------------------------------------------------- */
var NATIONAL_PENSION_A_2026 = 3193511;

/* 국민연금법 제51조·부칙의 가입시기별 상수 (국민연금공단·보건복지부 공개 산식)
   기본연금액 = [2.4(A+0.75B)×P1/P + 1.8(A+B)×P2/P + 1.5(A+B)×P3/P + 1.485(A+B)×P4/P + … + 1.245(A+B)×P(2025)/P + 1.29(A+B)×P(2026~)/P] × (1 + 0.05n/12)
     P1: 1988~1998년 가입월수, P2: 1999~2007년, P3: 2008년, 이후 매년 상수가 0.015씩 낮아져 2025년 1.245, 2026년 이후 1.29(연금개혁 소득대체율 43%)
   가입 시작 연도를 입력하지 않으면 공단 '예상연금월액표'와 같이 전 기간을 1.29로 계산합니다. */
function nationalPensionPeriodTerm(year, A, B) {
  if (year < 1999) return 2.4 * (A + 0.75 * B);
  if (year < 2008) return 1.8 * (A + B);
  if (year < 2026) return (1.5 - 0.015 * (year - 2008)) * (A + B);
  return 1.29 * (A + B);
}

// startYear: 가입 시작 연도(선택, 가입이 끊김 없이 이어졌다고 가정). 없으면 전 기간 1.29
function calcNationalBasicMonthly(totalMonths, avgIncomeMonthly, startYear) {
  var years = totalMonths / 12;
  var A = NATIONAL_PENSION_A_2026, B = avgIncomeMonthly;
  var term;
  if (startYear >= 1988) {
    var sum = 0, remaining = years, y = Math.floor(startYear), pos = startYear;
    while (remaining > 1e-9) {
      var span = Math.min(remaining, (y + 1) - pos);
      sum += nationalPensionPeriodTerm(y, A, B) * span;
      remaining -= span; pos = y + 1; y += 1;
    }
    term = sum / years;
  } else {
    term = 1.29 * (A + B);
  }
  // 월 연금액 = 기본연금액(연) ÷ 12. 지급률(10~20년 50%+연 5%p)·20년 초과 가산(연 5%p)은 모두 가입연수 ÷ 20 과 같음
  var monthly = term / 12 * (years / 20);
  return clampNonNegative(Math.min(monthly, B));
}

/* 공적연금 연계 시 국민연금 가입기간이 10년 미만인 경우의 연계노령연금액
   연계노령연금액 = 기본연금액 × (국민연금 가입기간 ÷ 20)   (찾기쉬운 생활법령정보, 1년 미만 월수는 1/12년)
   기본연금액은 가입기간 20년 미만이면 가입기간과 무관한 1.29(A+B)/12 이므로 위 식과 같은 값입니다.
   가입 시점별 계수와 미래 A값은 반영하지 않은 개략 추정입니다. */
function calcNationalLinkedPension(totalMonths, avgIncomeMonthly, startYear) {
  return calcNationalBasicMonthly(totalMonths, avgIncomeMonthly, startYear);
}

function nationalContributionRate(year) {
  if (year < 1993) return 0.03;
  if (year < 1998) return 0.06;
  if (year < 2026) return 0.09;
  return 0.095;
}

// 낸 보험료 총액 개략치: 가입 시작 연도가 없으면 현행 9%를 전 기간에 적용
function nationalContributionTotal(totalMonths, avgIncomeMonthly, startYear) {
  if (!(startYear >= 1988)) return avgIncomeMonthly * 0.09 * totalMonths;
  var total = 0, remaining = totalMonths / 12, y = Math.floor(startYear), pos = startYear;
  while (remaining > 1e-9) {
    var span = Math.min(remaining, (y + 1) - pos);
    total += avgIncomeMonthly * nationalContributionRate(y) * span * 12;
    remaining -= span; pos = y + 1; y += 1;
  }
  return total;
}

function calcNationalPension(input) {
  var totalMonths = input.years * 12 + input.months;
  var avgIncomeMonthly = input.avgIncomeManwon * 10000; // 만원 -> 원

  if (totalMonths <= 0 || avgIncomeMonthly <= 0) {
    return { error: "가입기간과 평균 소득월액을 올바르게 입력해 주세요." };
  }

  var eligible = totalMonths >= 120; // 최소 가입기간 10년

  // 10년 미만이면 노령연금 자체가 없어(반환일시금으로 지급) 월 수급액을 계산하지 않습니다.
  if (!eligible) {
    return {
      monthly: 0,
      yearly: 0,
      totalMonths: totalMonths,
      eligible: false,
      // 사업장가입자 기준 낸 보험료 총액(본인+사업주)의 개략치(이자 미반영). 가입 시작 연도를 입력하면 연도별 요율(1988~92년 3%, 93~97년 6%, 98~2025년 9%, 2026년 9.5%)을 적용
      refundEstimate: nationalContributionTotal(totalMonths, avgIncomeMonthly, input.startYear),
      // 공적연금 연계 시 국민연금 몫(연계노령연금) 개략 추정
      linkedMonthly: calcNationalLinkedPension(totalMonths, avgIncomeMonthly, input.startYear)
    };
  }

  var baseMonthly = calcNationalBasicMonthly(totalMonths, avgIncomeMonthly, input.startYear);

  // 조기노령연금: 수급개시연령보다 1년 앞당길 때마다 6%(월 0.5%) 감액, 최대 5년(30%)
  // 연기연금: 1년 늦출 때마다 7.2%(월 0.6%) 가산, 최대 5년(36%)
  var shift = Math.min(Math.max(Math.round(input.shiftYears) || 0, -5), 5);
  var adjustFactor = shift < 0 ? 1 + 0.06 * shift : 1 + 0.072 * shift;
  var monthly = baseMonthly * adjustFactor;

  return {
    monthly: monthly,
    yearly: monthly * 12,
    baseMonthly: baseMonthly,
    shiftYears: shift,
    adjustFactor: adjustFactor,
    totalMonths: totalMonths,
    taxableRatio: publicPensionTaxableRatio(totalMonths / 12, input.pre2002Years > 0 ? input.pre2002Years : (input.startYear >= 1988 ? Math.max(0, Math.min(2002, input.startYear + totalMonths / 12) - input.startYear) : 0)),
    startYear: input.startYear >= 1988 ? input.startYear : null,
    eligible: true
  };
}

/* -------------------------------------------------------------------------
   공무원·사학연금 퇴직일시금 (재직기간 10년 미만 퇴직 시)
   퇴직일시금 = 기준소득월액 × 재직연수 × 0.975
              + 기준소득월액 × 재직연수 × (5년 초과 재직연수 × 0.0065)   (5년 미만이면 첫 항만)
   - 사학연금: 사립학교교직원연금공단 공개 산식(재직월수 기준 표기와 동일한 식)
   - 공무원연금: 공무원연금법 제51조가 제43조제5항의 산식(0.975, 5년 초과분 0.0065)을 그대로 적용
   재직 1년 미만은 퇴직일시금이 아니라 기여금 반환 대상이라 null
   ------------------------------------------------------------------------- */
function calcSeveranceLumpSum(totalMonths, avgIncomeMonthly) {
  var years = totalMonths / 12;
  if (years < 1 || avgIncomeMonthly <= 0) return null;
  var factor = 0.975 + 0.0065 * Math.max(0, years - 5);
  return avgIncomeMonthly * years * factor;
}

/* 퇴직수당: 재직 1년 이상이면 퇴직일시금과 별도로 지급 (공무원연금공단·사학연금공단 공개 표, 2010년 이후 기간 기준)
   퇴직수당 = 기준소득월액 × 재직연수 × 지급비율 (1~5년 6.5%, 5~10년 22.75%, 10~15년 29.25%, 15~20년 32.5%, 20년 이상 39%) */
function calcRetirementAllowance(totalMonths, avgIncomeMonthly) {
  var years = totalMonths / 12;
  if (years < 1 || avgIncomeMonthly <= 0) return null;
  var rate = years < 5 ? 0.065 : years < 10 ? 0.2275 : years < 15 ? 0.2925 : years < 20 ? 0.325 : 0.39;
  return avgIncomeMonthly * years * rate;
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
   공무원연금 / 사학연금 / 군인연금 (직역연금)

   [공무원·사학연금] 재직기간을 3구간으로 나눠 각각 산정한 뒤 합산 (공무원연금공단 '연금액 산정' 안내, 공무원연금법 부칙)
     1기간 (2009.12.31 이전) : 재직 1년당 2.5% (20년 초과분은 1년당 2%)
     2기간 (2010.1.1~2015.12.31) : 재직 1년당 1.9%
     3기간 (2016.1.1 이후) : 연도별 지급률 — 2016년 1.878%에서 2020년 1.79%까지 매년 0.022%p,
        2021~2025년 1.78%→1.74%(매년 0.01%p), 2026~2035년 1.736%→1.7%(매년 0.004%p), 2035년 이후 1.7%
        재직 30년까지는 지급률 중 1%p에 소득재분배(본인 소득과 전체 공무원 평균소득 A의 중간 수준으로 조정)를 적용
        소득재분배 적용비율 = ((1+r)/2) ÷ r,  r = 본인 평균기준소득월액 ÷ A 를 0.1 단위로 내림(0.2 미만은 0.2, 1.6 초과는 1.6로 고정)
        A(전체 공무원 기준소득월액 평균액) 2026.5.1~2027.4.30 : 5,950,000원 (인사혁신처장 고시)
     재직기간 상한 : 36년. 다만 2016.1.1 당시 재직기간이 21년 이상이면 33년, 17년 이상이면 34년, 15년 이상이면 35년 (부칙 경과규정)
   ※ 1기간은 실제로는 2009년 이전 보수(현재가치 환산)를 기준으로 하지만 여기서는 입력한 평균 기준소득월액을 그대로 사용합니다.
   [군인연금] 복무기간 1년당 평균기준소득월액의 1.9%(전 기간 동일), 연금액은 평균기준소득월액의 62.7% 초과 불가
   ------------------------------------------------------------------------- */
var OCCUPATIONAL_REDIST_A_2026 = 5950000;

function occupationalAnnualRatePercent(year) {
  if (year <= 2015) return 1.9;
  if (year <= 2020) return 1.878 - (year - 2016) * 0.022;
  if (year <= 2025) return 1.78 - (year - 2021) * 0.01;
  if (year < 2035) return 1.736 - (year - 2026) * 0.004;
  return 1.7;
}

function occupationalCapYears(yearsAt2016) {
  if (yearsAt2016 >= 21) return 33;
  if (yearsAt2016 >= 17) return 34;
  if (yearsAt2016 >= 15) return 35;
  return 36;
}

// 소득재분배 적용비율 (공무원연금법 시행령 별표 구조: 구간 하한 기준)
function occupationalRedistributionFactor(avgIncomeMonthly) {
  var r = avgIncomeMonthly / OCCUPATIONAL_REDIST_A_2026;
  var low = Math.floor(r * 10 + 1e-9) / 10;
  if (low < 0.2) low = 0.2;
  if (low > 1.6) low = 1.6;
  return ((1 + low) / 2) / low;
}

function calcCivilSchoolPensionPercent(totalYears, retireYear, avgIncomeMonthly) {
  var start = retireYear - totalYears;
  var s1 = Math.max(0, Math.min(2010, retireYear) - start);
  var s2 = Math.max(0, Math.min(2016, retireYear) - Math.max(2010, start));
  var s3 = Math.max(0, retireYear - Math.max(2016, start));
  var yearsAt2016 = s1 + s2;
  var capYears = occupationalCapYears(yearsAt2016);
  var counted = Math.min(totalYears, capYears);
  var excess = totalYears - counted;

  // 상한을 넘는 기간은 가장 늦은 기간부터 제외
  var cut3 = Math.min(s3, excess); s3 -= cut3; excess -= cut3;
  var cut2 = Math.min(s2, excess); s2 -= cut2; excess -= cut2;
  s1 -= Math.min(s1, excess);

  var p1 = s1 <= 20 ? s1 * 2.5 : 50 + (s1 - 20) * 2;
  var p2 = s2 * 1.9;

  var factor = occupationalRedistributionFactor(avgIncomeMonthly);
  var startSeg3 = Math.max(2016, start);
  var p3 = 0;        // 본인 소득 기준 부분(지급률 - 1%p, 30년 초과분은 전체 지급률)
  var p3Redist = 0;  // 소득재분배 적용 부분(1%p)
  var cum = 0;
  for (var i = 0; i < s3; i++) {
    var frac = Math.min(1, s3 - i);
    var rate = occupationalAnnualRatePercent(Math.floor(startSeg3 + i + 1e-9));
    var inRedist = Math.max(0, Math.min(frac, 30 - cum));
    p3 += inRedist * (rate - 1.0) + (frac - inRedist) * rate;
    p3Redist += inRedist * 1.0;
    cum += frac;
  }
  var totalPercent = p1 + p2 + p3 + p3Redist * factor;

  return {
    percent: totalPercent,
    p1Percent: p1,
    countedYears: counted,
    capYears: capYears,
    yearsAt2016: yearsAt2016,
    excessYears: totalYears - counted,
    seg1Years: s1, seg2Years: s2, seg3Years: s3,
    redistFactor: factor
  };
}

// 공적연금 과세 대상 비율: 2001년 12월 31일 이전 기간(pre2002Years)은 과세하지 않으므로 (전체 − 이전) ÷ 전체
function publicPensionTaxableRatio(totalYears, pre2002Years) {
  if (!(totalYears > 0)) return 1;
  var pre = Math.min(Math.max(pre2002Years || 0, 0), totalYears);
  return (totalYears - pre) / totalYears;
}

// 직역연금(공무원·사학·군인)의 2001년 이전 기간 = 임용(입대)연도 역산값 기준
function occupationalTaxableRatio(totalYears, retireYear) {
  var start = retireYear - totalYears;
  var pre = Math.max(0, Math.min(2002, retireYear) - start);
  return publicPensionTaxableRatio(totalYears, pre);
}

/* 공무원·사학연금 퇴직연금 지급개시연령 (공무원연금공단 안내: 1996년 이후 임용자는 퇴직연도별로 단계적 상향)
   2016~2021년 퇴직 60세, 2022~2023년 61세, 2024~2026년 62세, 2027~2029년 63세, 2030~2032년 64세, 2033년 이후 65세.
   1996년 이전 임용자는 재직기간 요건에 따른 별도 특례(퇴직 즉시 지급 등)가 있어 null을 돌려줍니다. */
function occupationalPensionStartAge(retireYear, startYear) {
  if (startYear < 1996) return null;
  if (retireYear <= 2021) return 60;
  if (retireYear <= 2023) return 61;
  if (retireYear <= 2026) return 62;
  if (retireYear <= 2029) return 63;
  if (retireYear <= 2032) return 64;
  return 65;
}

// 조기퇴직연금: 지급개시연령에 미달하는 연수 1년당 5% 감액 (최대 5년, 25%)
function earlyRetirementPensionFactor(shortfallYears) {
  var y = Math.min(Math.max(Math.ceil(shortfallYears - 1e-9), 0), 5);
  return 1 - 0.05 * y;
}

// 공무원·사학·군인연금 결과 표에 붙는 지급개시연령·조기수령 행 (birthYear는 선택 입력)
function occupationalStartAgeRowsHtml(result, retireYear, birthYear, isMilitary) {
  if (isMilitary) {
    return '<tr><th>연금 지급 시기</th><td>전역(퇴직) 다음 달부터<div class="table-formula">복무 20년 이상이면 지급개시연령 제한 없이 전역 후 바로 퇴역연금을 받습니다</div></td></tr>';
  }
  var startAge = occupationalPensionStartAge(retireYear, result.startYear);
  if (startAge === null) {
    return '<tr><th>연금 지급 시기</th><td>임용 시기 특례 대상<div class="table-formula">1996년 이전 임용자는 재직기간 요건에 따라 퇴직 즉시 지급되는 등 별도 규정이 있어 공단에서 확인이 필요합니다</div></td></tr>';
  }
  var html = '<tr><th>연금 지급개시연령</th><td>만 ' + startAge + '세<div class="table-formula">' + retireYear + '년 퇴직 기준(1996년 이후 임용자, 퇴직연도별 단계 상향)</div></td></tr>';
  if (birthYear > 0) {
    var retireAge = retireYear - birthYear;
    if (retireAge >= startAge) {
      html += '<tr><th>퇴직 시 나이</th><td>만 ' + retireAge + '세 (퇴직 직후부터 지급)</td></tr>';
    } else {
      var shortfall = startAge - retireAge;
      var factor = earlyRetirementPensionFactor(shortfall);
      html += '<tr><th>퇴직 시 나이</th><td>만 ' + retireAge + '세 — 지급개시까지 ' + shortfall + '년</td></tr>';
      if (shortfall > 5) {
        return html + '<tr><th>조기퇴직연금</th><td>신청 불가<div class="table-formula">조기퇴직연금은 지급개시연령까지 5년 이내로 남은 경우에만 신청할 수 있습니다</div></td></tr>';
      }
      html += '<tr><th>조기퇴직연금 선택 시</th><td>월 ' + formatWon(result.monthly * factor) + '<div class="table-formula">미달 ' + Math.ceil(shortfall - 1e-9) + '년 × 5% 감액 → 연금의 ' + Math.round(factor * 100) + '% (최대 25% 감액, 감액은 평생 유지)</div></td></tr>';
    }
  }
  return html;
}

// 공무원·사학연금 결과 표의 산정 내역 행 (재직기간 구간·상한·소득재분배)
function occupationalDetailRowsHtml(result) {
  var d = result.detail;
  if (!d) return "";
  var fmt = function (n) { return (Math.round(n * 10) / 10).toString(); };
  var html = '';
  html += '<tr><th>추정 임용연도</th><td>약 ' + result.startYear + '년</td></tr>';
  var parts = [];
  if (d.seg1Years > 0) parts.push('2009년 이전 ' + fmt(d.seg1Years) + '년');
  if (d.seg2Years > 0) parts.push('2010~2015년 ' + fmt(d.seg2Years) + '년');
  if (d.seg3Years > 0) parts.push('2016년 이후 ' + fmt(d.seg3Years) + '년');
  html += '<tr><th>연금 반영 재직기간</th><td>' + fmt(d.countedYears) + '년 (상한 ' + d.capYears + '년)' +
    '<div class="table-formula">' + parts.join(' + ') + '</div>' +
    (d.excessYears > 0.05 ? '<div class="table-formula">상한 초과 ' + fmt(d.excessYears) + '년은 연금에 반영되지 않습니다.</div>' : '') +
    (d.capYears < 36 ? '<div class="table-formula">2016년 1월 1일 기준 재직 ' + fmt(d.yearsAt2016) + '년 → 상한 ' + d.capYears + '년(경과규정)</div>' : '') +
    '</td></tr>';
  if (d.seg1Years > 0) {
    html += '<tr><th>2009년 이전 재직분 기준</th><td>' + (result.usedPrePay ? '입력하신 평균보수월액 적용' : '평균 기준소득월액을 그대로 적용(추정)') + '<div class="table-formula">' + (result.usedPrePay ? '2009년 이전 ' + fmt(d.seg1Years) + '년분만 입력한 평균보수월액 기준' : '실제 기준은 2007~2009년 보수를 현재가치로 환산한 평균보수월액이라 평균 기준소득월액보다 낮은 경우가 많아 이 금액은 실제보다 높을 수 있습니다(공단 공개 산정 사례: 1987년 임용·2021년 퇴직자는 종전 구간 기준 보수가 평균 기준소득월액의 약 72%였고, 같은 입력을 이 계산기에 그대로 넣으면 실제보다 약 29% 높게 나옴). 종전 구간 평균보수월액을 아래 칸에 입력하면 더 정확해집니다') + '</div></td></tr>';
  }
  html += '<tr><th>적용 지급률 합계</th><td>' + result.ratePercent.toFixed(1) + '%' +
    (d.seg3Years > 0 ? '<div class="table-formula">2016년 이후 재직분은 소득재분배 적용비율 ' + (d.redistFactor * 100).toFixed(1) + '%(전체 공무원 평균 ' + Math.round(OCCUPATIONAL_REDIST_A_2026 / 10000) * 1 + '만원 기준 A값 반영) 적용</div>' : '') +
    '</td></tr>';
  return html;
}

/* 군인연금 퇴역연금 (군인연금법 부칙 경과규정, 국군재정관리단·찾기쉬운 생활법령정보)
   2013년 7월 1일 이전 복무기간: 평균보수월액 × (복무 20년까지 1년당 2.5%, 20년 초과분 1년당 2%)  — 33년이면 76%
   2013년 7월 1일 이후 복무기간: 평균기준소득월액 × 1년당 1.9%  — 33년이면 62.7%
   두 기간을 각각 산정해 합산합니다. 복무기간은 33년까지만 반영합니다.
   ※ 2013년 이전 구간의 기준은 실제로는 당시 보수(현재가치 환산)이지만 여기서는 입력한 평균 기준소득월액을 씁니다. */
var MILITARY_REFORM_YEAR = 2013.5;

function calcMilitaryPensionPercent(totalYears, retireYear) {
  var start = retireYear - totalYears;
  var s1 = Math.max(0, Math.min(MILITARY_REFORM_YEAR, retireYear) - start);
  var s2 = Math.max(0, retireYear - Math.max(MILITARY_REFORM_YEAR, start));
  var counted = Math.min(totalYears, 33);
  var excess = totalYears - counted;
  var cut2 = Math.min(s2, excess); s2 -= cut2; excess -= cut2;
  s1 -= Math.min(s1, excess);
  var p1 = s1 <= 20 ? s1 * 2.5 : 50 + (s1 - 20) * 2;
  var p2 = s2 * 1.9;
  return {
    percent: p1 + p2,
    p1Percent: p1,
    countedYears: counted,
    capYears: 33,
    excessYears: totalYears - counted,
    seg1Years: s1,
    seg2Years: s2
  };
}

function calcOccupationalPension(input) {
  var totalMonths = input.years * 12 + input.months;
  var avgIncomeMonthly = input.avgIncomeManwon * 10000;
  var isMilitary = input.type === "military";

  if (totalMonths <= 0 || avgIncomeMonthly <= 0 || !input.retireYear) {
    return { error: "재직기간, 평균 기준소득월액, 퇴직(예정)연도를 올바르게 입력해 주세요." };
  }

  // 군인연금: 복무 19년 6개월 이상~20년 미만은 20년으로 보아 퇴역연금 수급 (찾기쉬운 생활법령정보)
  var militaryRoundedUp = isMilitary && totalMonths >= 234 && totalMonths < 240;
  if (militaryRoundedUp) totalMonths = 240;

  // 공무원연금 기준소득월액 상한: 전체 공무원 평균의 160% (공무원연금공단)
  var incomeCapped = false;
  var incomeCapWon = Math.round(OCCUPATIONAL_REDIST_A_2026 * 1.6);
  if ((input.type === "civil" || input.type === "civilServant") && avgIncomeMonthly > incomeCapWon) { avgIncomeMonthly = incomeCapWon; incomeCapped = true; }

  var serviceYearsFull = totalMonths / 12;
  var startYear = Math.round(input.retireYear - serviceYearsFull);

  var avgAnnualRate;
  var cappedRatePercent;
  var detail = null;
  if (isMilitary) {
    detail = calcMilitaryPensionPercent(serviceYearsFull, input.retireYear);
    cappedRatePercent = detail.percent;
    avgAnnualRate = detail.countedYears > 0 ? detail.percent / detail.countedYears : 0;
  } else {
    detail = calcCivilSchoolPensionPercent(serviceYearsFull, input.retireYear, avgIncomeMonthly);
    cappedRatePercent = detail.percent;
    avgAnnualRate = detail.countedYears > 0 ? detail.percent / detail.countedYears : 0;
  }

  // 2009년 이전(군인연금은 2013년 6월 이전) 재직분의 기준은 당시 보수를 현재가치로 환산한 평균보수월액이라 평균기준소득월액과 다를 수 있어 별도 입력을 받습니다.
  var pre1Won = input.prePayManwon > 0 ? input.prePayManwon * 10000 : 0;
  var monthly;
  if (pre1Won > 0 && detail && detail.p1Percent > 0) {
    monthly = avgIncomeMonthly * ((cappedRatePercent - detail.p1Percent) / 100) + pre1Won * (detail.p1Percent / 100);
    cappedRatePercent = monthly / avgIncomeMonthly * 100;
  } else {
    monthly = avgIncomeMonthly * (cappedRatePercent / 100);
  }

  var eligible = isMilitary ? totalMonths >= 240 : totalMonths >= 120; // 최소 재직(복무)기간: 공무원·사학 10년, 군인 20년

  return {
    monthly: clampNonNegative(monthly),
    yearly: clampNonNegative(monthly) * 12,
    totalMonths: totalMonths,
    ratePercent: cappedRatePercent,
    avgAnnualRate: avgAnnualRate,
    startYear: startYear,
    eligible: eligible,
    detail: detail,
    incomeCapped: incomeCapped,
    incomeCapWon: incomeCapWon,
    militaryRoundedUp: militaryRoundedUp,
    usedPrePay: pre1Won > 0 && !!detail && detail.p1Percent > 0,
    effectiveIncomeMonthly: avgIncomeMonthly
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
  var existingSavings = (input.existingSavingsManwon || 0) * 10000;
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

  // 국민연금·직역연금은 수급 개시 후 매년 물가상승률만큼 자동 인상되므로(물가연동),
  // 오늘 계산한 예상 수령액을 "오늘 화폐가치 기준 실질 구매력"으로 보고, 별도의 물가
  // 상승률을 곱하지 않고 오늘 기준 적정생활비와 그대로 비교합니다. (다만 이 수령액에
  // 퇴직연금·개인연금처럼 물가연동이 없는 부분이 섞여 있다면, 그 부분의 실질가치는
  // 은퇴 후 시간이 지날수록 조금씩 낮아질 수 있습니다 — 이 계산기는 그 세부 구성까지는
  // 반영하지 않습니다.)
  var livingCostBenchmark = household === "couple" ? ADEQUATE_LIVING_COST_COUPLE : ADEQUATE_LIVING_COST_SINGLE;
  var gapVsBenchmark = livingCostBenchmark - projectedMonthly; // 양수면 부족

  var existingSavingsFV = existingSavings * Math.pow(1 + accumulationReturnPercent / 100, accumulationYears);
  var requiredMonthlySavings = 0;
  var neededLumpSum = 0;
  if (gapVsBenchmark > 0 && accumulationYears > 0) {
    neededLumpSum = requiredLumpSumForPayout(gapVsBenchmark, payoutYears, payoutReturnPercent);
    var remainingNeeded = Math.max(0, neededLumpSum - existingSavingsFV);
    requiredMonthlySavings = requiredAnnualContribution(remainingNeeded, accumulationYears, accumulationReturnPercent) / 12;
  }

  return {
    currentNet: currentNet,
    projectedMonthly: projectedMonthly,
    replacementRatio: replacementRatio,
    household: household,
    livingCostBenchmark: livingCostBenchmark,
    gapVsBenchmark: gapVsBenchmark,
    existingSavingsFV: existingSavingsFV,
    neededLumpSum: neededLumpSum,
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

// 종합소득세 기본세율 구간표(누진공제 포함, 지방소득세 별도) — 계산과 화면 표시(계산식 공개)에 공용으로 사용
var INCOME_TAX_BRACKETS = [
  { limit: 14000000, rate: 0.06, deduction: 0 },
  { limit: 50000000, rate: 0.15, deduction: 1260000 },
  { limit: 88000000, rate: 0.24, deduction: 5760000 },
  { limit: 150000000, rate: 0.35, deduction: 15440000 },
  { limit: 300000000, rate: 0.38, deduction: 19940000 },
  { limit: 500000000, rate: 0.40, deduction: 25940000 },
  { limit: 1000000000, rate: 0.42, deduction: 35940000 },
  { limit: Infinity, rate: 0.45, deduction: 65940000 }
];

function incomeTaxBracket(base) {
  base = clampNonNegative(base);
  for (var i = 0; i < INCOME_TAX_BRACKETS.length; i++) {
    if (base <= INCOME_TAX_BRACKETS[i].limit) return INCOME_TAX_BRACKETS[i];
  }
  return INCOME_TAX_BRACKETS[INCOME_TAX_BRACKETS.length - 1];
}

function progressiveIncomeTax(base) {
  base = clampNonNegative(base);
  var bracket = incomeTaxBracket(base);
  return base * bracket.rate - bracket.deduction;
}

// 공적연금소득세 근사 (국민연금·직역연금이 유일한 소득이라고 가정한 단순 추정)
// taxableRatio: 과세 대상 비율(0~1). 공적연금은 2002.1.1 이후 납입기간·재직기간에 해당하는 연금만 과세하므로
//   과세대상 연금액 = 연금액 × (2002년 이후 기간 ÷ 전체 기간) (국민연금공단·공무원연금공단 안내). 생략하면 전액 과세로 봅니다.
// 연금소득만 있는 경우 표준세액공제 7만원을 적용합니다.
function calcPublicPensionTax(annualPensionWon, taxableRatio) {
  var ratio = taxableRatio > 0 && taxableRatio < 1 ? taxableRatio : (taxableRatio === 0 ? 0 : 1);
  var w = clampNonNegative(annualPensionWon) * ratio;
  var deduction, deductionFormula;
  if (w <= 3500000) { deduction = w; deductionFormula = "연금액 전액"; }
  else if (w <= 7000000) { deduction = 3500000 + (w - 3500000) * 0.4; deductionFormula = "350만원 + (연금액 − 350만원) × 40%"; }
  else if (w <= 14000000) { deduction = 4900000 + (w - 7000000) * 0.2; deductionFormula = "490만원 + (연금액 − 700만원) × 20%"; }
  else { deduction = 6300000 + (w - 14000000) * 0.1; deductionFormula = "630만원 + (연금액 − 1,400만원) × 10%"; }
  var deductionCapped = deduction > 9000000;
  deduction = Math.min(deduction, 9000000);

  var pensionIncome = clampNonNegative(w - deduction);
  var basicDeduction = 1500000; // 본인 기본공제만 반영 (단순화)
  var taxBase = clampNonNegative(pensionIncome - basicDeduction);
  var bracket = incomeTaxBracket(taxBase);
  var computedTax = clampNonNegative(taxBase * bracket.rate - bracket.deduction);
  var incomeTax = clampNonNegative(computedTax - 70000); // 표준세액공제 7만원 (연금소득만 있는 경우)
  var totalTax = clampNonNegative(incomeTax * 1.1); // 지방소득세 10% 포함

  var appliedDeductionFormula = deductionCapped ? "900만원 한도 적용" : deductionFormula;
  var ratioText = ratio < 1 ? "과세대상 연금 " + formatWon(w) + "(연금의 " + fmtPct(ratio * 100) + "%) 기준, " : "";
  return {
    annualTax: totalTax,
    monthlyTax: totalTax / 12,
    deduction: deduction,
    deductionFormula: appliedDeductionFormula,
    taxBase: taxBase,
    bracketRatePercent: bracket.rate * 100,
    bracketDeduction: bracket.deduction,
    taxableRatio: ratio,
    formula: ratioText + "연금소득공제(" + appliedDeductionFormula + ") 반영 후 과세표준 " + formatWon(taxBase) + " × " + fmtPct(bracket.rate * 100) + "% − 누진공제 " + formatWon(bracket.deduction) + " − 표준세액공제 7만원 (연, 지방소득세 포함) ÷ 12개월"
  };
}

// 여러 공적연금(국민연금·직역연금)을 함께 받으면 연금소득이 합산 과세되므로, 과세 대상 금액을 합쳐 한 번에 세금을 계산하고 연금별 과세 대상 금액 비율로 나눕니다.
// items: [{ monthly, ratio }] → { monthlyTaxes: [연금별 월 세금], total, formula }
function calcCombinedPublicPensionTax(items) {
  var taxable = items.map(function (it) { return it.monthly * 12 * (it.ratio > 0 && it.ratio <= 1 ? it.ratio : (it.ratio === 0 ? 0 : 1)); });
  var sum = taxable.reduce(function (a, b) { return a + b; }, 0);
  var tax = calcPublicPensionTax(sum);
  var monthlyTaxes = taxable.map(function (t) { return sum > 0 ? tax.monthlyTax * (t / sum) : 0; });
  return { monthlyTaxes: monthlyTaxes, total: tax.monthlyTax, formula: (items.length > 1 ? "공적연금 합산 과세: 연금 합계 " + formatWon(sum) + " 기준 — " : "") + tax.formula };
}

// 퇴직소득세 (근속연수공제 → 환산급여 → 환산급여공제 → 세율 적용, 지방소득세 포함)
function calcRetirementIncomeTax(lumpSum, years) {
  lumpSum = clampNonNegative(lumpSum);
  years = Math.max(1, Math.ceil(years - 1e-9)); // 근속연수는 1년 미만 월수를 1년으로 올림

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
  var bracket = incomeTaxBracket(taxBase);
  var annualizedTax = clampNonNegative(taxBase * bracket.rate - bracket.deduction);
  var retirementTax = (annualizedTax / 12) * years;
  var totalTax = clampNonNegative(retirementTax * 1.1); // 지방소득세 10% 포함

  return {
    tax: totalTax,
    effectiveRate: lumpSum > 0 ? totalTax / lumpSum : 0,
    formula: "근속연수공제 " + formatWon(serviceDeduction) + " 반영 환산급여 " + formatWon(convertedWage) + " → 과세표준 " + formatWon(taxBase) + " × " + fmtPct(bracket.rate * 100) + "% − 누진공제 " + formatWon(bracket.deduction) + " → " + years + "년/12 재환산, 지방소득세 포함"
  };
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
function publicPensionTaxRowsHtml(monthly, taxableRatio) {
  var tax = calcPublicPensionTax(monthly * 12, taxableRatio);
  var afterTax = clampNonNegative(monthly - tax.monthlyTax);
  return (
    '<tr><th>세전 월 수급액</th><td>' + formatWon(monthly) + '</td></tr>' +
    (tax.taxableRatio < 1 ? '<tr><th>과세 대상 연금 비율</th><td>' + fmtPct(tax.taxableRatio * 100) + '%<div class="table-formula">2002년 이전 납입·재직 기간에 해당하는 연금은 과세하지 않습니다</div></td></tr>' : '') +
    '<tr><th>예상 세금 (연금소득세, 단독소득 가정)</th><td>-' + formatWon(tax.monthlyTax) + '<div class="table-formula">' + tax.formula + '</div></td></tr>' +
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
    html += '<tr><th>세후 월 지급액 (추정)</th><td><strong>' + formatWon(monthlyAfterTax) + '</strong><div class="table-formula">' + formatWon(monthly) + ' × (1 − ' + (rate * 100).toFixed(1) + '%)</div></td></tr>';
  } else {
    var otherIncomeTaxRate = 0.165;
    var afterTax = futureValue * (1 - otherIncomeTaxRate);
    html += '<tr><th>기타소득세 (일시금 수령, 지방소득세 포함 약 16.5%)</th><td>-' + formatWon(futureValue * otherIncomeTaxRate) + '<div class="table-formula">' + formatWon(futureValue) + ' × 16.5%</div></td></tr>';
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
    '<div class="result-empty"><p>입력값을 확인한 뒤 다시 계산해 주세요.</p></div>';
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
var UNEMPLOYMENT_DAILY_CAP_2026 = 68100;   // 구직급여일액 상한액(고용노동부 고시, 2026년 1월 1일 이직자부터)
var UNEMPLOYMENT_DAILY_FLOOR_2026 = MINIMUM_WAGE_2026 * 8 * 0.8; // 구직급여일액 하한액 = 최저임금 × 8시간 × 80% (2026년 66,048원)

// 국민연금 기준소득월액 상한·하한 (2026.7~2027.6 적용, 국민연금공단 고시)
var NATIONAL_PENSION_BASE_CEILING = 6590000;
var NATIONAL_PENSION_BASE_FLOOR = 410000;
// 건강보험 직장가입자 개인부담 보험료 월 상한액(2026) — 보수월액이 아니라 "계산된 보험료" 자체에 적용되는 상한
var HEALTH_INSURANCE_PREMIUM_CEILING = 4591740; // 전체 상한 9,183,480원의 절반 (건강보험공단 고시, 2026)

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

  var pensionBase = m;
  if (pensionType === "national" || !pensionType) {
    // 국민연금은 기준소득월액에 상한·하한이 있어, 이 구간을 벗어난 소득에는 보험료가 더 붙지 않습니다.
    pensionBase = Math.min(Math.max(m, NATIONAL_PENSION_BASE_FLOOR), NATIONAL_PENSION_BASE_CEILING);
  }
  var np = pensionBase * plan.rate;

  var healthRaw = m * RATE_HEALTH_INSURANCE;
  var hi = Math.min(healthRaw, HEALTH_INSURANCE_PREMIUM_CEILING);
  var ltc = hi * RATE_LONG_TERM_CARE_OF_PREMIUM; // 급여가 아니라 건강보험료(본인부담분)에 곱함
  var ei = plan.employmentInsurance ? m * RATE_EMPLOYMENT_INSURANCE : 0;
  return {
    pensionType: pensionType,
    pensionLabel: plan.label,
    employmentInsuranceApplicable: plan.employmentInsurance,
    pensionBase: pensionBase,
    pensionRatePercent: plan.rate * 100,
    pensionBaseCapped: pensionType === "national" && m !== pensionBase,
    nationalPension: np,
    healthBase: m,
    healthRatePercent: RATE_HEALTH_INSURANCE * 100,
    healthCapped: healthRaw > HEALTH_INSURANCE_PREMIUM_CEILING,
    healthInsurance: hi,
    ltcRatePercent: RATE_LONG_TERM_CARE_OF_PREMIUM * 100,
    longTermCare: ltc,
    eiRatePercent: RATE_EMPLOYMENT_INSURANCE * 100,
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
  return Math.min(14750000 + (g - 100000000) * 0.02, 20000000); // 근로소득공제 한도 2,000만원
}

// 월 소득세·지방소득세: 국세청 근로소득 간이세액표(js/withholding-table.js)에서 월 급여(비과세 제외)와
// 공제대상가족 수(본인 포함)로 조회합니다. 실제 급여명세서의 원천징수 방식과 같아, 4대보험료 소득공제·근로소득세액공제
// 등이 이미 반영된 값입니다. 8세 이상 20세 이하 자녀 공제는 options.childCount로 반영하고, 경로우대·장애인 공제는 반영하지 않습니다.
// 8ì¸ ì´ì 20ì¸ ì´í ìë ê³µì (ê°ì´ì¸ì¡í ìë´): 1ëª 12,500ì, 2ëª 29,160ì, 3ëª ì´ìì 29,160ì + 2ëª ì´ê³¼ 1ì¸ë¹ 25,000ì (ì ì¸ì¡ìì ì°¨ê°)
function withholdingChildDeduction(childCount) {
  var n = Math.max(0, Math.round(childCount) || 0);
  if (n === 0) return 0;
  if (n === 1) return 12500;
  return 29160 + (n - 2) * 25000;
}

function calcMonthlyIncomeTax(monthlyGrossWon, familyCount, childCount) {
  var fc = Math.min(Math.max(Math.round(familyCount) || 1, 1), 11);
  var monthly = clampNonNegative(monthlyGrossWon);
  var childDeduct = withholdingChildDeduction(childCount);
  var incomeTax = clampNonNegative(lookupWithholdingTax(monthly, fc) - childDeduct);
  var localTax = incomeTax * 0.1; // 지방소득세 = 소득세의 10% (법정 비율)
  return {
    incomeTax: incomeTax,
    localTax: localTax,
    taxableMonthly: monthly,
    familyCount: fc,
    childCount: Math.max(0, Math.round(childCount) || 0),
    childDeduct: childDeduct
  };
}

// 연봉 실수령액 (정방향): 월 급여(세전) -> 4대보험·세금 상세 + 월 실수령액
// options.nonTaxableWon: 비과세액(식대·자가운전보조금 등, 4대보험·소득세 산정 기준 모두에서 제외)
// options.familyCount: 부양가족 수(본인 포함, 기본값 1)
// options.withholdingRatio: 회사가 선택하는 소득세 원천징수 비율(80%/100%/120%, 기본값 1.0)
function calcTakeHomePay(monthlyGrossWon, pensionType, options) {
  options = options || {};
  var nonTaxable = clampNonNegative(options.nonTaxableWon || 0);
  var familyCount = options.familyCount > 0 ? options.familyCount : 1;
  var withholdingRatio = options.withholdingRatio > 0 ? options.withholdingRatio : 1.0;
  var m = clampNonNegative(monthlyGrossWon);
  if (m <= 0) return { error: "월 급여(세전)를 올바르게 입력해 주세요." };
  var taxableBase = clampNonNegative(m - nonTaxable);
  var insurance = calcInsuranceBreakdown(taxableBase, pensionType);
  var baseTax = calcMonthlyIncomeTax(taxableBase, familyCount, options.childCount);
  var incomeTax = clampNonNegative(baseTax.incomeTax * withholdingRatio);
  var tax = {
    incomeTax: incomeTax,
    localTax: incomeTax * 0.1,
    baseIncomeTax: baseTax.incomeTax,
    withholdingRatio: withholdingRatio,
    taxableMonthly: baseTax.taxableMonthly,
    familyCount: baseTax.familyCount,
    childCount: baseTax.childCount,
    childDeduct: baseTax.childDeduct
  };
  var totalDeduct = insurance.total + tax.incomeTax + tax.localTax;
  return {
    monthlyGross: m,
    nonTaxable: nonTaxable,
    taxableBase: taxableBase,
    withholdingRatio: withholdingRatio,
    insurance: insurance,
    tax: tax,
    totalDeduct: totalDeduct,
    net: clampNonNegative(m - totalDeduct)
  };
}

// 연봉 실수령액 (역산): 목표 월 실수령액 -> 필요한 세전 월급여 (이분 탐색)
// 공제액이 급여 구간(누진세율)에 따라 완전한 선형함수가 아니므로 근사적으로 이분 탐색을 사용합니다.
function solveGrossFromNet(targetMonthlyNetWon, pensionType, options) {
  var target = clampNonNegative(targetMonthlyNetWon);
  if (target <= 0) return { error: "목표 월 실수령액을 올바르게 입력해 주세요." };
  var lo = 0, hi = 500000000;
  for (var i = 0; i < 60; i++) {
    var mid = (lo + hi) / 2;
    var net = calcTakeHomePay(mid, pensionType, options).net;
    if (net < target) lo = mid; else hi = mid;
  }
  var gross = (lo + hi) / 2;
  // 간이세액표는 구간별로 세액이 계단식으로 바뀌어 실수령액이 구간 경계에서 소폭 줄어들 수 있으므로,
  // 목표 실수령액을 처음 달성하는 가장 낮은 급여를 근처에서 다시 찾습니다.
  for (var back = 0; back < 2000; back++) {
    var lower = gross - 100;
    if (lower <= 0 || calcTakeHomePay(lower, pensionType, options).net < target) break;
    gross = lower;
  }
  return calcTakeHomePay(gross, pensionType, options);
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
  // 월 소정근로시간(주휴 포함) = (주 근로시간 + 주휴시간) × 365 ÷ 7 ÷ 12 를 시간 단위로 반올림 (주 40시간 근무자는 209시간)
  var monthlyHours = Math.round((weeklyHours + weeklyHolidayHours) * 365 / 7 / 12);
  var monthlyPay = hourly * monthlyHours;

  return {
    hourly: hourly,
    weeklyHours: weeklyHours,
    weeklyHolidayHours: weeklyHolidayHours,
    weeklyPay: weeklyPay,
    monthlyHours: monthlyHours,
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
  var avgDailyWage = avgMonthlyWon * 12 / 365; // 평균임금 = 3개월 임금총액 ÷ 그 기간 일수 (월 평균 약 30.4일로 근사)
  var rawDaily = avgDailyWage * 0.6;
  var dailyBenefit = Math.max(Math.min(rawDaily, UNEMPLOYMENT_DAILY_CAP_2026), UNEMPLOYMENT_DAILY_FLOOR_2026);
  var bound = rawDaily > UNEMPLOYMENT_DAILY_CAP_2026 ? "cap" : rawDaily < UNEMPLOYMENT_DAILY_FLOOR_2026 ? "floor" : null;
  var days = unemploymentBenefitDays(input.insuredYears, input.age);
  return { dailyBenefit: dailyBenefit, days: days, total: dailyBenefit * days, bound: bound, rawDaily: rawDaily };
}

/* 4대보험·실수령액류 계산기 공통: 상세 내역 HTML */
// 소수점 요율을 "4.75", "0.9"처럼 불필요한 0 없이 표시
function fmtPct(n) {
  return (Math.round(n * 1000) / 1000).toString();
}

// 라벨 + 계산식(선택) + 금액 한 줄을 만드는 공용 헬퍼. 계산식은 결과 바로 위에 작은 글씨로 표시됩니다.
function dRow(label, formula, amountText, isTotal) {
  var inner = formula
    ? '<span class="d-formula">' + formula + '</span><span class="d-amount">' + amountText + '</span>'
    : amountText;
  return '<div class="d-row' + (isTotal ? ' total' : '') + '"><span>' + label + '</span><span>' + inner + '</span></div>';
}

function insuranceDeductDetailHtml(insurance, tax) {
  var pensionLabel = insurance.pensionLabel || "국민연금";
  var html = '<div class="deduct-detail">';
  html += '<div class="d-group-label">4대보험</div>';

  var healthFormula = insurance.healthCapped
    ? "월 459만원 상한 적용"
    : formatWon(insurance.healthBase) + " × " + fmtPct(insurance.healthRatePercent) + "%";
  html += dRow("건강보험", healthFormula, formatWon(insurance.healthInsurance));

  var ltcFormula = "건강보험료 " + formatWon(insurance.healthInsurance) + " × " + fmtPct(insurance.ltcRatePercent) + "%";
  html += dRow("장기요양보험", ltcFormula, formatWon(insurance.longTermCare));

  var pensionFormula = (insurance.pensionBaseCapped ? "상한액 " : "") + formatWon(insurance.pensionBase) + " × " + fmtPct(insurance.pensionRatePercent) + "%";
  html += dRow(pensionLabel, pensionFormula, formatWon(insurance.nationalPension));

  if (insurance.employmentInsuranceApplicable === false) {
    html += dRow("고용보험", "직역연금 가입자는 대상 제외", "해당없음");
  } else {
    var eiFormula = formatWon(insurance.healthBase) + " × " + fmtPct(insurance.eiRatePercent) + "%";
    html += dRow("고용보험", eiFormula, formatWon(insurance.employmentInsurance));
  }

  if (tax) {
    html += '<div class="d-group-label">세금</div>';
    var ratioNote = tax.withholdingRatio && tax.withholdingRatio !== 1 ? " × 원천징수비율 " + Math.round(tax.withholdingRatio * 100) + "%" : "";
    var taxFormula = "국세청 간이세액표: 월 급여 " + formatWon(tax.taxableMonthly) + ", 공제대상가족 " + tax.familyCount + "명" + (tax.childDeduct > 0 ? ", 8~20세 자녀 " + tax.childCount + "명 공제 -" + formatWon(tax.childDeduct) : "") + ratioNote;
    html += dRow("소득세", taxFormula, formatWon(tax.incomeTax));
    html += dRow("지방소득세", formatWon(tax.incomeTax) + " × 10%", formatWon(tax.localTax));
  }
  var total = insurance.total + (tax ? tax.incomeTax + tax.localTax : 0);
  html += dRow("공제 합계", null, formatWon(total), true);
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
    avgDailyWageFormula: formatWon(last3MonthsWage) + " ÷ 91일",
    severance: clampNonNegative(severance),
    severanceFormula: formatWon(avgDailyWage) + " × 30일 × (" + serviceDays + "일 ÷ 365일)",
    years: years,
    tax: tax.tax,
    taxFormula: tax.formula,
    afterTax: clampNonNegative(severance - tax.tax),
    eligible: true
  };
}

/* -------------------------------------------------------------------------
   프리랜서 원천징수 계산기 — 사업소득(3.3%) / 기타소득(8.8%) 두 종류
   - 사업소득: 계속적·반복적으로 용역을 제공할 때. 소득세 3%+지방소득세 0.3%=3.3%를 원천징수.
   - 기타소득: 일시적·우발적 인적용역(단발성 강연료·원고료 등). 필요경비 60%를 의제 공제한
     나머지(40%)에 소득세 20%+지방소득세 2%(소득세의 10%)=22%를 매겨, 총액 기준으로는
     40% × 22% = 8.8%를 원천징수.
   두 경우 모두 원천징수는 예납 성격이며, 실제 세부담은 다음 해 5월 종합소득세 신고 때 확정됩니다.
   ------------------------------------------------------------------------- */
var FREELANCER_WITHHOLDING_RATE = 0.033;
var OTHER_INCOME_NECESSARY_EXPENSE_RATE = 0.6;
var OTHER_INCOME_TAX_RATE = 0.2;
var OTHER_INCOME_LOCAL_TAX_RATE = 0.02;
var OTHER_INCOME_WITHHOLDING_RATE = (1 - OTHER_INCOME_NECESSARY_EXPENSE_RATE) * (OTHER_INCOME_TAX_RATE + OTHER_INCOME_LOCAL_TAX_RATE);

function calcFreelancerTax(grossWon, incomeType) {
  var g = clampNonNegative(grossWon);
  if (g <= 0) return { error: "용역대가(계약금액)를 올바르게 입력해 주세요." };
  if (incomeType === "other") {
    var taxBase = g * (1 - OTHER_INCOME_NECESSARY_EXPENSE_RATE);
    var incomeTaxOther = taxBase * OTHER_INCOME_TAX_RATE;
    var localTaxOther = taxBase * OTHER_INCOME_LOCAL_TAX_RATE;
    return { gross: g, incomeType: "other", taxBase: taxBase, incomeTax: incomeTaxOther, localTax: localTaxOther, withheld: incomeTaxOther + localTaxOther, net: g - incomeTaxOther - localTaxOther };
  }
  var incomeTax = g * 0.03;
  var localTax = g * 0.003;
  return { gross: g, incomeType: "business", incomeTax: incomeTax, localTax: localTax, withheld: incomeTax + localTax, net: g - incomeTax - localTax };
}

function solveFreelancerGrossFromNet(targetNetWon, incomeType) {
  var target = clampNonNegative(targetNetWon);
  if (target <= 0) return { error: "원하는 실수령액을 올바르게 입력해 주세요." };
  var rate = incomeType === "other" ? OTHER_INCOME_WITHHOLDING_RATE : FREELANCER_WITHHOLDING_RATE;
  var gross = target / (1 - rate);
  return calcFreelancerTax(gross, incomeType);
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

// 6+6 부모육아휴직제: 자녀 생후 18개월 이내 부모 모두 육아휴직 시 각자 첫 6개월 통상임금 100%, 월 상한 250·250·300·350·400·450만원 (고용노동부)
var PARENTAL_LEAVE_SIX_PLUS_SIX_CAPS = [2500000, 2500000, 3000000, 3500000, 4000000, 4500000];
// mode: "normal"(일반) | "sixsix"(6+6) | "single"(한부모: 1~6개월 100%·상한 300만원)
function parentalLeaveMonthlyPay(monthlyOrdinaryWageWon, monthIndex, mode) {
  var rate, cap;
  if (mode === "sixsix" && monthIndex <= 6) { rate = 1.0; cap = PARENTAL_LEAVE_SIX_PLUS_SIX_CAPS[monthIndex - 1]; }
  else if (mode === "single" && monthIndex <= 6) { rate = 1.0; cap = 3000000; }
  else if (monthIndex <= 3) { rate = 1.0; cap = 2500000; }
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
    var pay = parentalLeaveMonthlyPay(monthlyWageWon, m, input.mode);
    var special = (input.mode === "sixsix" || input.mode === "single") && m <= 6;
    var tier = special ? (input.mode === "sixsix" ? "6+6 특례: 통상임금 100%, 상한 " + (PARENTAL_LEAVE_SIX_PLUS_SIX_CAPS[m - 1] / 10000) + "만원" : "한부모 특례: 통상임금 100%, 상한 300만원") : m <= 3 ? "통상임금 100%, 상한 250만원" : m <= 6 ? "통상임금 100%, 상한 200만원" : "통상임금 80%, 상한 160만원";
    rows.push({ month: m, pay: pay, tier: tier });
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
  office: { label: "금융 및 보험업", rate: 0.005 },
  retail: { label: "도소매·음식·숙박업", rate: 0.008 },
  manufacturing: { label: "제조업(기계기구·금속·비금속광물제품)", rate: 0.013 },
  transport: { label: "운수업(육상 및 수상운수업)", rate: 0.018 },
  construction: { label: "건설업", rate: 0.035 }
};

// 2026년도 사업종류별 산재보험료율(고용노동부고시 제2025-91호)의 대표 업종 요율. 모든 업종에 출퇴근재해 요율 0.06%가 함께 부과됩니다.
var COMMUTE_ACCIDENT_RATE_2026 = 0.0006;
var MINIMUM_WAGE_DAILY_2026 = MINIMUM_WAGE_2026 * 8; // 82,560원

function calcIndustrialAccidentPremium(input) {
  var totalWageWon = input.totalWageManwon * 10000;
  var industry = INDUSTRIAL_ACCIDENT_RATES[input.industry];
  if (totalWageWon <= 0 || (!industry && !(input.customRatePermil > 0))) {
    return { error: "보수총액과 업종을 올바르게 입력해 주세요." };
  }
  var custom = input.customRatePermil > 0;
  var baseRate = custom ? input.customRatePermil / 1000 : industry.rate;
  var totalRate = baseRate + COMMUTE_ACCIDENT_RATE_2026;
  return { industryLabel: custom ? "직접 입력한 요율" : industry.label, custom: custom, rate: totalRate, baseRate: baseRate, commuteRate: COMMUTE_ACCIDENT_RATE_2026, premium: totalWageWon * totalRate };
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
  return {
    avgDailyWage: avgDailyWage,
    avgDailyWageFormula: formatWon(last3MonthsWage) + " ÷ 91일",
    dailyBenefit: dailyBenefit,
    dailyBenefitFormula: dailyBenefit === basic ? formatWon(avgDailyWage) + " × 70%" : "저소득 특례: min(" + formatWon(avgDailyWage) + " × 90%, 최저임금 일급)",
    leaveDays: leaveDays,
    total: dailyBenefit * leaveDays
  };
}

/* -------------------------------------------------------------------------
   연말정산 예상세액 계산기 (종합판)
   총급여 -> 근로소득공제 -> 근로소득금액
     -> 소득공제: 인적공제, 4대보험료(특별소득공제), 신용카드 등 사용액,
        주택마련저축·주택저당차입금이자(주택자금)
   -> 과세표준 -> 산출세액
     -> 세액공제: 근로소득세액공제, 자녀세액공제, 연금계좌세액공제,
        보험료·의료비·교육비·기부금(특별세액공제), 월세액
   -> 결정세액
   국세청 고시 한도표·공제율은 2026년 기준으로 웹 검색을 통해 재확인한
   값을 사용했습니다(신용카드 15%/30%/40%, 월세 17%/15%, 기부금 15%/30%/40%
   등). 다만 신용카드 추가한도의 항목별 세부 한도, 의료비 한도없는 대상과
   일반 대상의 배분 순서 등은 실제 국세청 계산 방식을 단순화했습니다.
   자녀세액공제는 국세청 안내 기준 1명 25만원, 2명 55만원, 3명 이상은
   55만원에 2명 초과 1인당 40만원을 더한 금액입니다.
   ------------------------------------------------------------------------- */
function laborIncomeTaxCredit(computedTax, totalGrossWon) {
  // 소득세법 제59조: 산출세액 130만원 이하 55%, 130만원 초과분은 71만5천원 + 초과분의 30%
  var credit = computedTax <= 1300000 ? computedTax * 0.55 : 715000 + (computedTax - 1300000) * 0.3;

  var cap;
  if (totalGrossWon <= 33000000) cap = 740000;
  else if (totalGrossWon <= 70000000) cap = Math.max(660000, 740000 - (totalGrossWon - 33000000) * 0.008);
  else if (totalGrossWon <= 120000000) cap = Math.max(500000, 660000 - (totalGrossWon - 70000000) * 0.5);
  else cap = Math.max(200000, 500000 - (totalGrossWon - 120000000) * 0.5);

  return Math.min(credit, cap);
}

function pensionAccountTaxCredit(contributionWon, totalGrossWon) {
  var capped = Math.min(contributionWon, 9000000);
  var rate = totalGrossWon <= 55000000 ? 0.165 : 0.132;
  return capped * rate;
}

// 자녀세액공제 (기본공제대상 8세 이상 자녀 수 기준, 국세청 안내 금액)
function childTaxCredit(childCount) {
  if (!(childCount > 0)) return 0;
  if (childCount === 1) return 250000;
  if (childCount === 2) return 550000;
  return 550000 + (childCount - 2) * 400000;
}

// 신용카드 등 사용액 소득공제
// 낮은 공제율 항목부터 총급여의 25% 초과 기준선을 소진시키는 국세청 계산 순서를 반영합니다.
function creditCardDeduction(input, totalGrossWon) {
  var categories = [
    { amount: input.creditCardWon || 0, rate: 0.15 },
    { amount: input.debitCardWon || 0, rate: 0.30 },
    { amount: input.booksCultureWon || 0, rate: 0.30 },
    { amount: input.traditionalMarketWon || 0, rate: 0.40 },
    { amount: input.publicTransportWon || 0, rate: 0.40 }
  ];
  var totalUsage = categories.reduce(function (sum, c) { return sum + c.amount; }, 0);
  var threshold = totalGrossWon * 0.25;
  if (totalUsage <= threshold || totalUsage <= 0) return { deduction: 0, totalUsage: totalUsage };

  var remainingThreshold = threshold;
  var baseAmount = 0; // 신용카드·체크카드 등(기본한도 대상)
  var special = { books: 0, market: 0, transit: 0 }; // 항목별 추가한도 대상
  var lowIncome = totalGrossWon <= 70000000; // 도서·공연 추가공제는 총급여 7천만원 이하만 해당

  categories.forEach(function (cat, idx) {
    var eligible = Math.max(0, cat.amount - remainingThreshold);
    remainingThreshold = Math.max(0, remainingThreshold - cat.amount);
    var value = eligible * cat.rate;
    if (idx === 2) { if (lowIncome) special.books += value; else baseAmount += value; }
    else if (idx === 3) special.market += value;
    else if (idx === 4) special.transit += value;
    else baseAmount += value;
  });

  var baseCap = totalGrossWon <= 70000000 ? 3000000 : (totalGrossWon <= 120000000 ? 2500000 : 2000000);
  // 추가한도: 전통시장·대중교통 각 100만원, 도서·공연 100만원(총급여 7천만원 이하). 기본한도를 넘는 부분에 한해 적용됩니다.
  var specialAll = special.books + special.market + special.transit;
  var specialCap = Math.min(special.books, 1000000) + Math.min(special.market, 1000000) + Math.min(special.transit, 1000000);

  var deduction = Math.min(baseAmount + specialAll, baseCap + specialCap);
  return { deduction: deduction, totalUsage: totalUsage };
}

// 의료비 세액공제: 총급여 3% 초과분에 15% (한도없는 대상 우선 적용 후 일반 대상 700만원 한도)
function medicalExpenseCredit(normalMedicalWon, unlimitedMedicalWon, totalGrossWon) {
  var total = (normalMedicalWon || 0) + (unlimitedMedicalWon || 0);
  var floor = totalGrossWon * 0.03;
  var excess = clampNonNegative(total - floor);
  if (excess <= 0) return 0;
  var unlimitedPart = Math.min(excess, unlimitedMedicalWon || 0);
  var normalPart = Math.min(clampNonNegative(excess - unlimitedPart), 7000000);
  return (unlimitedPart + normalPart) * 0.15;
}

// 보험료 세액공제: 일반보장성 100만원 한도 12%, 장애인전용보장성 100만원 한도 15%
function insurancePremiumCredit(generalWon, disabledWon) {
  return Math.min(generalWon || 0, 1000000) * 0.12 + Math.min(disabledWon || 0, 1000000) * 0.15;
}

// 교육비 세액공제 15% (본인·대학생·취학전~고교 인당 한도는 입력 시점에 이미 반영되었다고 가정)
function educationExpenseCredit(totalEducationWon) {
  return (totalEducationWon || 0) * 0.15;
}

// 월세 세액공제: 총급여 5,500만원 이하 17%, 5,500만~8,000만원 15%, 8,000만원 초과는 대상 아님. 한도 1,000만원.
function monthlyRentCredit(rentWon, totalGrossWon) {
  if (!(rentWon > 0) || totalGrossWon > 80000000) return 0;
  var rate = totalGrossWon <= 55000000 ? 0.17 : 0.15;
  return Math.min(rentWon, 10000000) * rate;
}

// 기부금 세액공제: 1천만원 이하 15%, 1천만~3천만원 30%, 3천만원 초과 40%
function donationCredit(donationWon) {
  var d = donationWon || 0;
  if (d <= 0) return 0;
  if (d <= 10000000) return d * 0.15;
  if (d <= 30000000) return 10000000 * 0.15 + (d - 10000000) * 0.3;
  return 10000000 * 0.15 + 20000000 * 0.3 + (d - 30000000) * 0.4;
}

// 주택자금: 청약저축 등 소득공제(무주택세대주, 총급여 7천만원 이하, 300만원 한도 40%)
//           + 장기주택저당차입금 이자상환액 소득공제(단순화하여 한도 2000만원 전액)
function housingFundDeduction(input) {
  var savings = Math.min(input.housingSavingsWon || 0, 3000000) * 0.4;
  var mortgageInterest = Math.min(input.mortgageInterestWon || 0, 20000000);
  return savings + mortgageInterest;
}

function calcYearEndTax(input) {
  var totalGross = input.totalGrossManwon * 10000;
  var dependents = input.dependents || 0;
  var childCount = input.childCount || 0;
  var pensionType = input.pensionType || "national";
  var pensionContribution = (input.pensionContributionManwon || 0) * 10000;
  var withheldTax = (input.withheldTaxManwon || 0) * 10000;

  if (totalGross <= 0) return { error: "연간 총급여를 올바르게 입력해 주세요." };

  var f = {}; // 각 항목의 계산식 문자열(화면 표시용) — 계산 로직 자체에는 영향 없음

  var laborDeduction = laborIncomeDeduction(totalGross);
  if (totalGross <= 5000000) f.laborDeduction = formatWon(totalGross) + " × 70%";
  else if (totalGross <= 15000000) f.laborDeduction = "350만원 + (" + formatWon(totalGross) + " − 500만원) × 40%";
  else if (totalGross <= 45000000) f.laborDeduction = "750만원 + (" + formatWon(totalGross) + " − 1,500만원) × 15%";
  else if (totalGross <= 100000000) f.laborDeduction = "1,200만원 + (" + formatWon(totalGross) + " − 4,500만원) × 5%";
  else f.laborDeduction = "1,475만원 + (" + formatWon(totalGross) + " − 1억원) × 2% (한도 2,000만원)";
  var laborIncome = clampNonNegative(totalGross - laborDeduction);

  // ---- 소득공제 ----
  var seniorCount = Math.max(0, Math.round(input.seniorCount || 0));      // 경로우대(만 70세 이상) 기본공제대상자 수
  var disabledCount = Math.max(0, Math.round(input.disabledCount || 0)); // 장애인 기본공제대상자 수
  var extraPersonal = seniorCount * 1000000 + disabledCount * 2000000;
  var extraNotes = [];
  if (seniorCount > 0) extraNotes.push("경로우대 " + seniorCount + "명 × 100만원");
  if (disabledCount > 0) extraNotes.push("장애인 " + disabledCount + "명 × 200만원");
  // 한부모(100만원)와 부녀자(50만원) 공제는 중복 적용되지 않고 한부모 공제가 우선합니다. 부녀자 공제는 종합소득금액 3천만원 이하(총급여 약 4,147만원 이하)일 때만 해당합니다.
  if (input.singleParent) { extraPersonal += 1000000; extraNotes.push("한부모 100만원"); }
  else if (input.womanHousehold) {
    if (totalGross <= 41470588) { extraPersonal += 500000; extraNotes.push("부녀자 50만원"); }
    else extraNotes.push("부녀자 공제는 총급여 약 4,147만원 이하만 해당(미적용)");
  }
  var personalDeduction = (1 + dependents) * 1500000 + extraPersonal;
  f.personalDeduction = "(본인 포함 " + (1 + dependents) + "명) × 150만원" + (extraNotes.length ? " + " + extraNotes.join(" + ") : "");

  var monthlyInsurance = calcInsuranceBreakdown(totalGross / 12, pensionType);
  var insuranceAnnual = monthlyInsurance.total * 12;
  f.insuranceAnnual = "월 4대보험료(" + monthlyInsurance.pensionLabel + ") " + formatWon(monthlyInsurance.total) + " × 12개월";

  var cardInput = {
    creditCardWon: (input.creditCardManwon || 0) * 10000,
    debitCardWon: (input.debitCardManwon || 0) * 10000,
    booksCultureWon: (input.booksCultureManwon || 0) * 10000,
    traditionalMarketWon: (input.traditionalMarketManwon || 0) * 10000,
    publicTransportWon: (input.publicTransportManwon || 0) * 10000
  };
  var cardResult = creditCardDeduction(cardInput, totalGross);
  f.cardDeduction = cardResult.totalUsage > 0
    ? "총사용액 " + formatWon(cardResult.totalUsage) + " 중 총급여 25%(" + formatWon(totalGross * 0.25) + ") 초과분에 항목별 공제율 적용"
    : "사용액 없음";

  var housingSavings = (input.housingSavingsManwon || 0) * 10000;
  var mortgageInterest = (input.mortgageInterestManwon || 0) * 10000;
  var housingDeduction = housingFundDeduction({ housingSavingsWon: housingSavings, mortgageInterestWon: mortgageInterest });
  f.housingDeduction = "청약저축 등 " + formatWon(Math.min(housingSavings, 3000000)) + " × 40% + 주택저당이자상환액 " + formatWon(Math.min(mortgageInterest, 20000000));

  var totalIncomeDeduction = personalDeduction + insuranceAnnual + cardResult.deduction + housingDeduction;
  var taxBase = clampNonNegative(laborIncome - totalIncomeDeduction);

  var taxBracket = incomeTaxBracket(taxBase);
  var computedTax = clampNonNegative(taxBase * taxBracket.rate - taxBracket.deduction);
  f.computedTax = "과세표준 " + formatWon(taxBase) + " × " + fmtPct(taxBracket.rate * 100) + "% − 누진공제 " + formatWon(taxBracket.deduction);

  // ---- 세액공제 ----
  var earnedIncomeCredit = laborIncomeTaxCredit(computedTax, totalGross);
  var earnedCreditBase = computedTax <= 1300000 ? computedTax * 0.55 : 715000 + (computedTax - 1300000) * 0.3;
  f.earnedIncomeCredit = (computedTax <= 1300000 ? "산출세액 " + formatWon(computedTax) + " × 55%" : "71만5천원 + (산출세액 − 130만원) × 30%")
    + (earnedIncomeCredit < earnedCreditBase ? " → 한도 " + formatWon(earnedIncomeCredit) + " 적용" : "");

  var childCredit = childTaxCredit(childCount);
  f.childCredit = childCount <= 0 ? "대상 자녀 없음"
    : childCount === 1 ? "1명 25만원"
    : childCount === 2 ? "2명 55만원"
    : "2명 55만원 + (" + (childCount - 2) + "명 × 40만원)";

  // 출산·입양 세액공제(해당 과세연도 출산·입양): 첫째 30만원, 둘째 50만원, 셋째 이상 70만원
  var birthOrder = Math.round(input.birthOrder || 0);
  var birthCredit = birthOrder <= 0 ? 0 : birthOrder === 1 ? 300000 : birthOrder === 2 ? 500000 : 700000;
  f.birthCredit = birthOrder <= 0 ? "해당 없음" : (birthOrder >= 3 ? "셋째 이상" : (birthOrder === 1 ? "첫째" : "둘째")) + " 출산·입양 " + (birthCredit / 10000) + "만원";
  // 혼인세액공제(생애 1회, 2024~2026년 혼인신고): 50만원
  var marriageCredit = input.marriage ? 500000 : 0;
  f.marriageCredit = marriageCredit > 0 ? "혼인신고 50만원(생애 1회)" : "해당 없음";

  var pensionCredit = pensionAccountTaxCredit(pensionContribution, totalGross);
  var pensionRate = totalGross <= 55000000 ? 16.5 : 13.2;
  f.pensionCredit = "납입액(900만원 한도) " + formatWon(Math.min(pensionContribution, 9000000)) + " × " + pensionRate + "%";

  var medicalCredit = medicalExpenseCredit(
    (input.normalMedicalManwon || 0) * 10000,
    (input.unlimitedMedicalManwon || 0) * 10000,
    totalGross
  );
  f.medicalCredit = "총의료비 − 총급여 3%(" + formatWon(totalGross * 0.03) + ") 초과분 × 15%";

  var generalInsurance = (input.generalInsuranceManwon || 0) * 10000;
  var disabledInsurance = (input.disabledInsuranceManwon || 0) * 10000;
  var insuranceCredit = insurancePremiumCredit(generalInsurance, disabledInsurance);
  f.insuranceCredit = "일반 " + formatWon(Math.min(generalInsurance, 1000000)) + " × 12% + 장애인전용 " + formatWon(Math.min(disabledInsurance, 1000000)) + " × 15%";

  var educationTotal = (input.educationManwon || 0) * 10000;
  var educationCredit = educationExpenseCredit(educationTotal);
  f.educationCredit = formatWon(educationTotal) + " × 15%";

  var rentTotal = (input.monthlyRentManwon || 0) * 10000;
  var rentCredit = monthlyRentCredit(rentTotal, totalGross);
  f.rentCredit = !(rentTotal > 0) ? "월세 입력 없음"
    : totalGross > 80000000 ? "총급여 8,000만원 초과로 대상 아님"
    : "월세(1,000만원 한도) " + formatWon(Math.min(rentTotal, 10000000)) + " × " + (totalGross <= 55000000 ? 17 : 15) + "%";

  var donationTotal = (input.donationManwon || 0) * 10000;
  var donationCreditAmount = donationCredit(donationTotal);
  f.donationCredit = donationTotal <= 0 ? "기부금 없음"
    : donationTotal <= 10000000 ? formatWon(donationTotal) + " × 15%"
    : donationTotal <= 30000000 ? "1천만원 × 15% + (" + formatWon(donationTotal - 10000000) + ") × 30%"
    : "1천만원 × 15% + 2천만원 × 30% + (" + formatWon(donationTotal - 30000000) + ") × 40%";

  // 표준세액공제(13만원): 특별소득공제(주택자금)·특별세액공제(보험료·의료비·교육비·기부금)·월세 세액공제를 합쳐도
  // 13만원에 못 미치면, 그 공제들을 신청하지 않고 표준세액공제 13만원을 받는 편이 유리합니다.
  // 국세청 안내: 특별소득공제·특별세액공제·월세액 세액공제를 신청하지 않을 때만 표준세액공제 13만원이 적용됩니다.
  var specialCreditSum = medicalCredit + insuranceCredit + educationCredit + rentCredit + donationCreditAmount;
  var standardCredit = 0;
  if (housingDeduction <= 0 && specialCreditSum < 130000) {
    standardCredit = 130000;
    if (specialCreditSum > 0) {
      f.medicalCredit = f.insuranceCredit = f.educationCredit = f.rentCredit = f.donationCredit = "표준세액공제(13만원)가 더 유리해 적용 안 함";
    }
    medicalCredit = 0; insuranceCredit = 0; educationCredit = 0; rentCredit = 0; donationCreditAmount = 0;
  }
  var totalTaxCredit = earnedIncomeCredit + childCredit + birthCredit + marriageCredit + pensionCredit + medicalCredit +
    insuranceCredit + educationCredit + rentCredit + donationCreditAmount + standardCredit;

  var finalTax = clampNonNegative(computedTax - totalTaxCredit);
  var finalLocalTax = finalTax * 0.1;
  f.finalLocalTax = "결정세액(소득세) " + formatWon(finalTax) + " × 10%";
  var finalTotal = finalTax + finalLocalTax;

  var withheldLocalTax = withheldTax * 0.1;
  var withheldTotal = withheldTax + withheldLocalTax;

  return {
    totalGross: totalGross,
    laborDeduction: laborDeduction,
    laborIncome: laborIncome,
    personalDeduction: personalDeduction,
    insuranceAnnual: insuranceAnnual,
    cardDeduction: cardResult.deduction,
    cardTotalUsage: cardResult.totalUsage,
    housingDeduction: housingDeduction,
    totalIncomeDeduction: totalIncomeDeduction,
    taxBase: taxBase,
    computedTax: computedTax,
    earnedIncomeCredit: earnedIncomeCredit,
    childCredit: childCredit,
    birthCredit: birthCredit,
    marriageCredit: marriageCredit,
    pensionCredit: pensionCredit,
    medicalCredit: medicalCredit,
    insuranceCredit: insuranceCredit,
    educationCredit: educationCredit,
    rentCredit: rentCredit,
    donationCredit: donationCreditAmount,
    standardCredit: standardCredit,
    totalTaxCredit: totalTaxCredit,
    finalTax: finalTax,
    finalLocalTax: finalLocalTax,
    finalTotal: finalTotal,
    withheldTotal: withheldTotal,
    hasWithheld: withheldTax > 0,
    refundOrDue: withheldTotal - finalTotal, // 양수면 환급, 음수면 추가 납부
    f: f
  };
}
