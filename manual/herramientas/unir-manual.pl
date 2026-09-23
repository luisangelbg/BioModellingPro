#!/usr/bin/perl
# BioModelling Pro · manual de usuario: une las partes de un idioma en un solo documento para imprimirlo a PDF.
# Uso, desde la carpeta manual/:   perl herramientas/unir-manual.pl es
# Escribe es/manual-completo.html con la portada (00a-portada.html) como primera hoja, las secciones de
# 00b-introduccion.html (preliminares e introducción) y de 01-bloque1.html a 11-apendices.html en orden, los
# estilos propios de cada parte y un solo paginar.js: la numeración de páginas es continua, el índice general
# encuentra las páginas de todos los capítulos y, al imprimir el documento de una sola vez, sus enlaces siguen
# funcionando en el PDF.
use strict; use warnings; use utf8;
use open qw(:std :encoding(UTF-8));

my $lang = shift or die "uso: perl herramientas/unir-manual.pl <carpeta del idioma>\n";
opendir my $dh, $lang or die "$lang: $!";
my @parts = sort grep { /^(00b|0[1-9]|1\d)-.*\.html$/ && $_ ne 'manual-completo.html' } readdir $dh;
closedir $dh;
die "no hay partes en $lang\n" unless @parts;

my (@rules, %seen, $body, $head);
$body = '';
for my $p (@parts) {
  open my $fh, '<', "$lang/$p" or die "$p: $!"; my $t = do { local $/; <$fh> }; close $fh;
  $head //= $t;
  # the tab of the chapter scopes a rule that only that chapter wants
  my ($tab) = $t =~ /<section class="capitulo"[^>]*data-pestana="([^"]+)"/;
  if ($t =~ /<style>(.*?)<\/style>/s) {
    my $css = $1; $css =~ s{/\*.*?\*/}{}gs;
    while ($css =~ /([^{}]+)\{([^}]*)\}/g) {
      my ($sel, $decl) = ($1, $2);
      s/\s+/ /g, s/^ | $//g for $sel, $decl;
      push @rules, [$sel, $decl, $tab, $p];
    }
  }
  my $i = index($t, '<body>'); my $j = rindex($t, '</body>');
  die "$p sin <body>\n" if $i < 0 || $j < 0;
  my $b = substr($t, $i + 6, $j - $i - 6);
  $b =~ s{<script\b.*?</script>}{}gs;
  $body .= "\n<!-- ====================================================================== $p -->\n" . $b;
}

# a selector written the same way everywhere is kept once; one that a part writes differently keeps the
# most common declaration for all, and the other version applies only on the sheets of its chapter
my %by;
push @{ $by{$_->[0]}{$_->[1]} }, $_ for @rules;
my $css = '';
my %done;
for my $r (@rules) {
  my $sel = $r->[0];
  next if $done{$sel}++;
  my @decls = sort { @{ $by{$sel}{$b} } <=> @{ $by{$sel}{$a} } } keys %{ $by{$sel} };
  $css .= "  $sel { $decls[0] }\n";
  for my $d (@decls[1 .. $#decls]) {
    for my $x (@{ $by{$sel}{$d} }) {
      die "$x redefine $sel y no tiene pestaña de capítulo\n" unless $x->[2];
      my $scoped = join ', ', map { qq{.hoja[data-pestana="$x->[2]"] $_} } split /\s*,\s*/, $sel;
      $css .= "  $scoped { $d }\n";
    }
  }
}

my ($links) = $head =~ /(<link rel="preconnect".*?<script src="\.\.\/paginar\.js"><\/script>)/s;
die "no encuentro el encabezado común\n" unless $links;

# the cover is not paginated: it is a sheet of its own before the book, drawn by its own script,
# with no running head and no page number
my $portada = '';
if (-e "$lang/00a-portada.html") {
  open my $fh, '<', "$lang/00a-portada.html" or die; my $t = do { local $/; <$fh> }; close $fh;
  my ($svg) = $t =~ /<section class="page cover"[^>]*>(.*?)<\/section>/s;
  my ($script) = $t =~ /(<script>.*?<\/script>)/s;
  my ($fonts) = $t =~ /(<link href="https:\/\/fonts\.googleapis\.com[^>]*>)/;
  die "00a-portada.html no tiene la estructura esperada\n" unless $svg && $script;
  $portada = qq{<div class="hoja portada cover" aria-label="Portada">$svg</div>\n$script\n};
  $links = "$fonts\n$links" if $fonts;
  if ($t =~ /<style>(.*?)<\/style>/s) { $css .= "  $1\n"; }
  $css .= "  .portada > svg { display: block; width: 100%; height: 100%; }\n";
}
my $html = <<"HTML";
<!doctype html>
<html lang="$lang">
<head>
<meta charset="utf-8">
<title>BioModelling Pro · Manual de usuario</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- documento generado por herramientas/unir-manual.pl: no se edita a mano; se corrigen las partes -->
$links
<style>
$css</style>
</head>
<body>
$portada$body
</body>
</html>
HTML
open my $oh, '>', "$lang/manual-completo.html" or die; print $oh $html; close $oh;
printf "%d partes, %d reglas de estilo distintas, %d secciones -> %s/manual-completo.html\n",
  scalar @parts, scalar(keys %done), scalar(() = $body =~ /<section\b/g), $lang;
