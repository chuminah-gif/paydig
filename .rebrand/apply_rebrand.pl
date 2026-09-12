#!/usr/bin/perl
use strict;
use warnings;
use utf8;
binmode(STDOUT, ":utf8");

my $HEADER_TMPL = <<'HEADER';
<header class="site-header">
  <div class="container">
    <a href="__ROOT__index.html" class="logo"><svg viewBox="0 0 32 32" class="logo-mark" aria-hidden="true"><circle cx="13" cy="13" r="8" fill="none" stroke="#1E3A5F" stroke-width="3"/><line x1="19" y1="19" x2="26" y2="26" stroke="#1E3A5F" stroke-width="3" stroke-linecap="round"/><text x="13" y="16.5" font-size="9" font-weight="800" fill="#C43F32" text-anchor="middle">&#8361;</text></svg> 페이딕</a>
    <nav class="main-nav">
      <a href="__ROOT__index.html">홈</a>
      <div class="nav-item">
        <a href="#" class="dropdown-toggle">실수령액 <span class="caret">▾</span></a>
        <div class="dropdown-menu">
          <a href="__CALC__salary-net.html">연봉 실수령액·역산</a>
          <a href="__CALC__minimum-wage.html">최저시급 계산기</a>
        </div>
      </div>
      <div class="nav-item">
        <a href="#" class="dropdown-toggle">4대보험 <span class="caret">▾</span></a>
        <div class="dropdown-menu">
          <a href="__CALC__national-pension.html">국민연금</a>
          <a href="__CALC__health-insurance.html">건강보험료</a>
          <a href="__CALC__employment-insurance.html">고용보험 실업급여</a>
          <a href="__CALC__four-insurance.html">4대보험 통합계산기</a>
        </div>
      </div>
      <div class="nav-item">
        <a href="#" class="dropdown-toggle">연금 <span class="caret">▾</span></a>
        <div class="dropdown-menu">
          <div class="dropdown-heading">공적연금</div>
          <a href="__CALC__national-pension.html">국민연금</a>
          <a href="__CALC__civil-servant-pension.html">공무원연금</a>
          <a href="__CALC__military-pension.html">군인연금</a>
          <a href="__CALC__private-school-pension.html">사학연금</a>
          <div class="dropdown-heading">퇴직연금</div>
          <a href="__CALC__retirement-db.html">DB형(확정급여형)</a>
          <a href="__CALC__retirement-dc.html">DC형(확정기여형)</a>
          <a href="__CALC__irp.html">IRP</a>
          <div class="dropdown-heading">개인연금</div>
          <a href="__CALC__pension-savings.html">연금저축</a>
          <a href="__CALC__personal-pension.html">연금보험</a>
          <a href="__ROOT__simulation.html">통합 시뮬레이션</a>
        </div>
      </div>
      <a href="__ROOT__guide/index.html">가이드</a>
      <a href="__ROOT__about.html">사이트소개</a>
    </nav>
    <button class="nav-toggle" aria-label="메뉴 열기" aria-expanded="false">☰</button>
  </div>
</header>
HEADER

my $FOOTER_TMPL = <<'FOOTER';
<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div>
        <h4>페이딕</h4>
        <p>4대보험·실수령액·연말정산부터 공적연금·퇴직연금·개인연금까지, 내 월급과 관련된 모든 계산을 무료로 해볼 수 있는 정보 제공 사이트입니다. 본 사이트는 특정 금융상품을 권유하거나 투자자문을 제공하지 않습니다.</p>
      </div>
      <div>
        <h4>계산기</h4>
        <ul>
          <li><a href="__CALC__salary-net.html">연봉 실수령액 계산기</a></li>
          <li><a href="__CALC__four-insurance.html">4대보험 통합 계산기</a></li>
          <li><a href="__CALC__national-pension.html">국민연금 계산기</a></li>
          <li><a href="__ROOT__simulation.html">통합 시뮬레이션</a></li>
        </ul>
      </div>
      <div>
        <h4>사이트 정보</h4>
        <ul>
          <li><a href="__ROOT__about.html">사이트 소개</a></li>
          <li><a href="__ROOT__guide/index.html">연금 가이드</a></li>
          <li><a href="__ROOT__contact.html">문의하기</a></li>
          <li><a href="__ROOT__privacy.html">개인정보처리방침</a></li>
          <li><a href="__ROOT__terms.html">이용약관</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© 2026 페이딕. All rights reserved.</span>
      <span>본 사이트의 계산 결과는 참고용이며 법적 효력이 없습니다.</span>
    </div>
  </div>
</footer>
FOOTER

sub build {
    my ($tmpl, $root, $calc) = @_;
    my $out = $tmpl;
    $out =~ s/__ROOT__/$root/g;
    $out =~ s/__CALC__/$calc/g;
    return $out;
}

my @files = @ARGV;
for my $file (@files) {
    open(my $fh, '<:encoding(UTF-8)', $file) or die "cannot open $file: $!";
    local $/;
    my $content = <$fh>;
    close($fh);

    my ($root, $calc);
    if ($file =~ m{(^|[\\/])calculators[\\/]}) {
        $root = '../'; $calc = '';
    } elsif ($file =~ m{(^|[\\/])guide[\\/]}) {
        $root = '../'; $calc = '../calculators/';
    } else {
        $root = ''; $calc = 'calculators/';
    }

    my $new_header = build($HEADER_TMPL, $root, $calc);
    my $new_footer = build($FOOTER_TMPL, $root, $calc);

    my $n1 = ($content =~ s/<header class="site-header">.*?<\/header>\r?\n/$new_header/s);
    my $n2 = ($content =~ s/<footer class="site-footer">.*?<\/footer>\r?\n/$new_footer/s);

    # 사이트명 전면 교체 (title/description/본문/저작권 표기 등)
    $content =~ s/연금랩/페이딕/g;

    open(my $out, '>:encoding(UTF-8)', $file) or die "cannot write $file: $!";
    print $out $content;
    close($out);

    print "updated $file (header=$n1 footer=$n2)\n";
}
