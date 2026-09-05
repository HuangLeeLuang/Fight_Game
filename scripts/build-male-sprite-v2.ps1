param(
  [string]$SourceSheet = "$PSScriptRoot/../public/assets/characters/sheets/male-actions.png",
  [string]$GeneratedSheet = "$PSScriptRoot/../public/assets/characters/sheets/male-actions-v2-source.png",
  [string]$OutputSheet = "$PSScriptRoot/../public/assets/characters/sheets/male-actions-v2.png"
)

$ErrorActionPreference = 'Stop'
$magick = (Get-Command magick -ErrorAction Stop).Source
$work = Join-Path ([System.IO.Path]::GetTempPath()) ("fight-game-sprites-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $work | Out-Null

try {
  for ($index = 0; $index -lt 24; $index += 1) {
    $x = ($index % 4) * 384
    $y = [math]::Floor($index / 4) * 512
    $name = Join-Path $work ($index.ToString('000') + '.png')
    & $magick $SourceSheet -crop "384x512+$x+$y" +repage $name
  }

  # Image generation keeps the visual grid but may vary cell spacing. These hand-checked
  # boxes isolate the 18 clean poses without pulling pixels from a neighbouring pose.
  $boxes = @(
    @(52, 8, 135, 200), @(199, 8, 145, 200), @(370, 8, 145, 200),
    @(548, 8, 155, 200), @(714, 8, 205, 200), @(938, 8, 180, 200),
    @(1128, 8, 175, 200), @(43, 210, 175, 200), @(267, 210, 245, 200),
    @(535, 210, 220, 200), @(768, 210, 210, 200), @(1018, 210, 225, 200),
    @(42, 410, 190, 200), @(263, 410, 225, 200), @(485, 410, 215, 200),
    @(685, 410, 180, 200), @(880, 410, 190, 200), @(1080, 410, 225, 200)
  )

  for ($extra = 0; $extra -lt $boxes.Count; $extra += 1) {
    $box = $boxes[$extra]
    $x, $y, $cropWidth, $cropHeight = $box
    $name = Join-Path $work (($extra + 24).ToString('000') + '.png')
    & $magick $GeneratedSheet -crop "${cropWidth}x${cropHeight}+$x+$y" +repage `
      -alpha off -fuzz 16% -transparent white -trim +repage `
      -resize 'x360' -resize '370x500>' -gravity south -background none -extent '384x512' $name
  }

  & $magick montage (Join-Path $work '*.png') -tile '7x6' -geometry '384x512+0+0' -background none $OutputSheet
} finally {
  Remove-Item -LiteralPath $work -Recurse -Force
}
