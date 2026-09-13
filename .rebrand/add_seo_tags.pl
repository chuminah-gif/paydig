#!/usr/bin/perl
use strict;
use warnings;
use utf8;
binmode(STDOUT, ":utf8");

my $SITE = 'https://pension-lab-phi.vercel.app';

my @files = @ARGV;
for my $file (@files) {
    open(my $fh, '<:encoding(UTF-8)', $file) or die "cannot open $file: $!";
    local $/;
    my $content = <$fh>;
    close($fh);

    # 이미 canonical이 있으면 통째로 제거하고 다시 생성 (재실행 안전)
    $content =~ s/\n?<link rel="canonical"[^>]*>\n?//;
    $content =~ s/\n?<meta property="og:[^"]*"[^>]*>\n?//g;
    $content =~ s/\n?<meta name="twitter:[^"]*"[^>]*>\n?//g;

    my ($title) = $content =~ m{<title>(.*?)</title>};
    my ($desc) = $content =~ m{<meta name="description" content="(.*?)"\s*/?>};
    $title ||= '페이딕';
    $desc  ||= '';

    # 파일 경로 -> 사이트 URL (calculators.js, .rebrand 등은 대상 아님, .html만 호출됨)
    my $path = $file;
    $path =~ s{^\./}{};
    $path =~ s{\\}{/}g;
    my $url = "$SITE/$path";

    my $esc_title = $title;
    my $esc_desc = $desc;
    my $site_name = "\x{d398}\x{c774}\x{b515}"; # 페이딕

    my $tags = qq{<link rel="canonical" href="$url" />\n<meta property="og:type" content="website" />\n<meta property="og:site_name" content="$site_name" />\n<meta property="og:title" content="$esc_title" />\n<meta property="og:description" content="$esc_desc" />\n<meta property="og:url" content="$url" />\n<meta property="og:locale" content="ko_KR" />\n<meta name="twitter:card" content="summary" />\n<meta name="twitter:title" content="$esc_title" />\n<meta name="twitter:description" content="$esc_desc" />\n};

    # description 메타 태그 바로 뒤에 삽입
    if ($content =~ s{(<meta name="description" content="[^"]*"\s*/?>\n)}{$1$tags}) {
        # inserted
    } else {
        # description 태그가 없으면 </head> 앞에 삽입
        $content =~ s{</head>}{$tags</head>};
    }

    open(my $out, '>:encoding(UTF-8)', $file) or die "cannot write $file: $!";
    print $out $content;
    close($out);

    print "seo-tagged $file\n";
}
