# Voix off (Windows, voix « Microsoft Hortense ») : une piste WAV par phrase + horodatage de chaque mot
# (événements SpeakProgress), pour caler animations et sous-titres karaoké.
#   powershell -ExecutionPolicy Bypass -File video/scripts/voice.ps1
# Le texte affiché (« show ») peut différer du texte prononcé (« say ») pour corriger la prononciation.
Add-Type -AssemblyName System.Speech

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "public\voice"
New-Item -ItemType Directory -Force $out | Out-Null

$lines = @(
  @{ id = "l1"; show = "Trouver une adresse à Kisangani, ça coûte combien ?"; say = "Trouver une adresse à Kisangani, ça coûte combien ?" },
  @{ id = "l2"; show = "Rien."; say = "Rien." },
  @{ id = "l3"; show = "Avec Boyoma Connect, c'est gratuit."; say = "Avec Boyoma Connect, c'est gratuit." },
  @{ id = "l4"; show = "Pharmacies, hôtels, restaurants, garages…"; say = "Pharmacies, hôtels, restaurants, garages..." },
  @{ id = "l5"; show = "Cherchez, trouvez, appelez directement."; say = "Cherchez, trouvez, appelez directement." },
  @{ id = "l6"; show = "Plus de 200 lieux, dans toute la Tshopo."; say = "Plus de deux cents lieux, dans toute la Tchopo." },
  @{ id = "l7"; show = "Vous avez un établissement ? Votre fiche aussi est gratuite."; say = "Vous avez un établissement ? Votre fiche aussi est gratuite." },
  @{ id = "l8"; show = "Boyoma Connect. Toute la Tshopo, à portée de main."; say = "Boyoma Connect. Toute la Tchopo, à portée de main." }
)

$result = @()
foreach ($l in $lines) {
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $s.SelectVoice("Microsoft Hortense Desktop")
  $s.Rate = 1
  $s.Volume = 100
  $script:words = New-Object System.Collections.ArrayList
  $s.add_SpeakProgress({ param($sender, $e) [void]$script:words.Add(@{ text = $e.Text; ms = [int]$e.AudioPosition.TotalMilliseconds }) })
  $file = Join-Path $out ($l.id + ".wav")
  $s.SetOutputToWaveFile($file)
  $s.Speak($l.say)
  $s.Dispose()
  # Durée réelle du fichier : taille des données PCM / octets par seconde (en-tête WAV standard).
  $bytes = [System.IO.File]::ReadAllBytes($file)
  $byteRate = [BitConverter]::ToInt32($bytes, 28)
  $dataSize = $bytes.Length - 44
  $durationMs = [int](1000 * $dataSize / $byteRate)
  $result += @{ id = $l.id; show = $l.show; say = $l.say; file = "voice/" + $l.id + ".wav"; durationMs = $durationMs; words = @($script:words) }
  Write-Output ("{0} {1} ms, {2} mots" -f $l.id, $durationMs, $script:words.Count)
}

$json = ConvertTo-Json $result -Depth 5
[System.IO.File]::WriteAllText((Join-Path $root "src\voice.json"), $json, (New-Object System.Text.UTF8Encoding $false))
