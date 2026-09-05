param(
  [string]$MaleSheet = "$PSScriptRoot/../public/assets/characters/sheets/male-actions-v2.png",
  [string]$FemaleSheet = "$PSScriptRoot/../public/assets/characters/sheets/female-actions.png"
)

$ErrorActionPreference = 'Stop'
$magick = (Get-Command magick -ErrorAction Stop).Source
$work = Join-Path ([System.IO.Path]::GetTempPath()) ("fight-game-tripled-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $work | Out-Null

function New-TransitionSheets {
  param(
    [string]$Source,
    [int]$Columns,
    [int]$FrameWidth,
    [int]$FrameHeight,
    [int]$FrameCount,
    [hashtable]$NextFrames,
    [string]$OutputEarly,
    [string]$OutputLate,
    [string]$Prefix
  )

  $prefixWork = Join-Path $work $Prefix
  New-Item -ItemType Directory -Path $prefixWork | Out-Null
  for ($index = 0; $index -lt $FrameCount; $index += 1) {
    $next = if ($NextFrames.ContainsKey($index)) { $NextFrames[$index] } else { ($index + 1) % $FrameCount }
    $x1 = ($index % $Columns) * $FrameWidth
    $y1 = [math]::Floor($index / $Columns) * $FrameHeight
    $x2 = ($next % $Columns) * $FrameWidth
    $y2 = [math]::Floor($next / $Columns) * $FrameHeight
    $frameA = Join-Path $prefixWork 'from.png'
    $frameB = Join-Path $prefixWork 'to.png'
    & $magick $Source -crop "${FrameWidth}x${FrameHeight}+$x1+$y1" +repage $frameA
    & $magick $Source -crop "${FrameWidth}x${FrameHeight}+$x2+$y2" +repage $frameB
    $early = Join-Path $prefixWork ('early-' + $index.ToString('000') + '.png')
    $late = Join-Path $prefixWork ('late-' + $index.ToString('000') + '.png')
    & $magick $frameA $frameB -define compose:args=67,33 -compose blend -composite $early
    & $magick $frameA $frameB -define compose:args=34,66 -compose blend -composite $late
  }

  $earlyFull = Join-Path $prefixWork 'early-full.png'
  $lateFull = Join-Path $prefixWork 'late-full.png'
  & $magick montage (Join-Path $prefixWork 'early-*.png') -tile "${Columns}x" -geometry "${FrameWidth}x${FrameHeight}+0+0" -background none $earlyFull
  & $magick montage (Join-Path $prefixWork 'late-*.png') -tile "${Columns}x" -geometry "${FrameWidth}x${FrameHeight}+0+0" -background none $lateFull
  & $magick $earlyFull -filter point -resize '50%' $OutputEarly
  & $magick $lateFull -filter point -resize '50%' $OutputLate
}

try {
  & $magick $MaleSheet -filter point -resize '50%' "$PSScriptRoot/../public/assets/characters/sheets/male-actions-v3-key.png"
  & $magick $FemaleSheet -filter point -resize '50%' "$PSScriptRoot/../public/assets/characters/sheets/female-actions-v3-key.png"
  $maleNext = @{
    0=24; 24=0; 25=1; 1=26; 26=27; 27=25;
    28=2; 2=29; 29=3; 3=30; 30=39;
    31=4; 4=32; 32=5; 5=31;
    6=33; 33=34; 34=7; 7=35; 35=39;
    16=17; 17=18; 18=19; 19=20; 20=21; 21=22; 22=23; 23=0;
    37=36; 36=8; 8=0; 9=38; 38=0;
    10=39; 39=40; 40=10; 11=41; 41=0
  }
  New-TransitionSheets -Source $MaleSheet -Columns 7 -FrameWidth 384 -FrameHeight 512 -FrameCount 42 `
    -NextFrames $maleNext `
    -OutputEarly "$PSScriptRoot/../public/assets/characters/sheets/male-actions-v3-inbetween-a.png" `
    -OutputLate "$PSScriptRoot/../public/assets/characters/sheets/male-actions-v3-inbetween-b.png" -Prefix 'male'

  $femaleNext = @{
    0=21; 21=0; 18=1; 1=19; 19=18;
    2=23; 23=3; 3=21;
    4=20; 20=28; 28=30; 30=29; 29=31; 31=24;
    22=32; 32=33; 33=24;
    34=35; 35=36; 36=37; 37=38; 38=39; 39=0;
    25=8; 8=0; 9=27; 27=0; 10=24; 24=10; 11=11
  }
  New-TransitionSheets -Source $FemaleSheet -Columns 7 -FrameWidth 448 -FrameHeight 512 -FrameCount 40 `
    -NextFrames $femaleNext `
    -OutputEarly "$PSScriptRoot/../public/assets/characters/sheets/female-actions-v3-inbetween-a.png" `
    -OutputLate "$PSScriptRoot/../public/assets/characters/sheets/female-actions-v3-inbetween-b.png" -Prefix 'female'
} finally {
  if ((Resolve-Path $work).Path.StartsWith([System.IO.Path]::GetTempPath(), [System.StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $work -Recurse -Force
  }
}
