# Builds manifest.json (list of question numbers + optional difficulty per unit folder).
# Run via the .bat file. This file is ASCII-only on purpose (Korean chars are built from code points).
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location -LiteralPath $root

# pattern: "<number>(beon)_(munje)[_(sang|jung|ha)].png"
$word = [string][char]0xBC88 + '_' + [char]0xBB38 + [char]0xC81C
$sang = [string][char]0xC0C1
$jung = [string][char]0xC911
$ha   = [string][char]0xD558
$re = [regex]('^(\d+)' + $word + '(?:_(' + $sang + '|' + $jung + '|' + $ha + '))?\.png$')

$result = [ordered]@{}
$total = 0
Get-ChildItem -LiteralPath $root -Recurse -File -Filter '*.png' |
  Where-Object { $_.FullName -notmatch '\\\.' } |
  ForEach-Object {
    $name = $_.Name.Normalize([Text.NormalizationForm]::FormC)
    $m = $re.Match($name)
    if (-not $m.Success) { return }
    $rel = $_.DirectoryName.Substring($root.Length).TrimStart('\').Replace('\', '/')
    $i = $rel.LastIndexOf('/')
    if ($i -le 0) { return }
    $book = $rel.Substring(0, $i)
    $unit = $rel.Substring($i + 1)
    if (-not $result.Contains($book)) { $result[$book] = [ordered]@{} }
    if (-not $result[$book].Contains($unit)) { $result[$book][$unit] = [ordered]@{} }
    $num = [int]$m.Groups[1].Value
    $diff = if ($m.Groups[2].Success) { $m.Groups[2].Value } else { $null }
    # 같은 번호에 난이도 표시가 있는 파일과 없는 파일이 같이 있으면, 표시가 있는 쪽을 우선함
    if (-not $result[$book][$unit].Contains($num) -or $diff) { $result[$book][$unit][$num] = $diff }
    $total++
  }

$bookParts = foreach ($book in $result.Keys) {
  $unitParts = foreach ($unit in $result[$book].Keys) {
    $numParts = foreach ($num in ($result[$book][$unit].Keys | Sort-Object)) {
      $diff = $result[$book][$unit][$num]
      $diffJson = if ($diff) { '"' + $diff + '"' } else { 'null' }
      '"' + $num + '":' + $diffJson
    }
    '"' + $unit + '":{' + ($numParts -join ',') + '}'
  }
  Write-Host ("  " + $book + " : " + ($result[$book].Keys -join ', '))
  '"' + $book + '":{' + ($unitParts -join ',') + '}'
}
$json = '{' + ($bookParts -join ',') + '}'
[IO.File]::WriteAllText((Join-Path $root 'manifest.json'), $json)

Write-Host ""
Write-Host ("  OK! " + $total + " questions -> manifest.json")
