# Tutoriel « inscrire son établissement » — voix off (Windows, voix « Microsoft Hortense ») : une piste WAV par phrase + horodatage de chaque mot
# (événements SpeakProgress), pour caler animations et sous-titres karaoké.
#   powershell -ExecutionPolicy Bypass -File video/scripts/voice-tuto.ps1
# Le texte affiché (« show ») peut différer du texte prononcé (« say ») pour corriger la prononciation.
Add-Type -AssemblyName System.Speech

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "public\voice"
New-Item -ItemType Directory -Force $out | Out-Null

$lines = @(
  @{ id = "t1"; show = "Votre établissement sur Boyoma Connect, c'est gratuit. Voici comment faire, étape par étape."; say = "Votre établissement sur Boyoma Connect, c'est gratuit. Voici comment faire, étape par étape." },
  @{ id = "t2"; show = "Étape un : vérifiez qu'il n'existe pas déjà. Cherchez son nom dans l'application."; say = "Étape un : vérifiez qu'il n'existe pas déjà. Cherchez son nom dans l'application." },
  @{ id = "t3"; show = "S'il existe, ouvrez sa fiche et touchez « Réclamez cette fiche »."; say = "S'il existe, ouvrez sa fiche et touchez : Réclamez cette fiche." },
  @{ id = "t4"; show = "Étape deux : créez votre compte. Touchez « Compte », puis « Créer un compte »."; say = "Étape deux : créez votre compte. Touchez : Compte, puis : Créer un compte." },
  @{ id = "t5"; show = "Indiquez votre nom, votre e-mail et un mot de passe d'au moins 8 caractères, puis acceptez les conditions."; say = "Indiquez votre nom, votre e-mail et un mot de passe d'au moins huit caractères, puis acceptez les conditions." },
  @{ id = "t6"; show = "Ouvrez l'e-mail reçu et cliquez sur le lien de confirmation. Vous pouvez aussi continuer avec Google."; say = "Ouvrez l'e-mail reçu et cliquez sur le lien de confirmation. Vous pouvez aussi continuer avec Google." },
  @{ id = "t7"; show = "Étape trois : touchez le bouton « + », puis « Créer ma fiche »."; say = "Étape trois : touchez le bouton plus, puis : Créer ma fiche." },
  @{ id = "t8"; show = "Donnez le nom de votre établissement, sa catégorie, et votre commune ou territoire."; say = "Donnez le nom de votre établissement, sa catégorie, et votre commune ou territoire." },
  @{ id = "t9"; show = "Ajoutez une courte présentation, l'adresse et un repère : par exemple, en face du marché central."; say = "Ajoutez une courte présentation, l'adresse et un repère : par exemple, en face du marché central." },
  @{ id = "t10"; show = "Si vous êtes dans votre établissement, touchez « Utiliser ma position actuelle » pour le placer sur la carte."; say = "Si vous êtes dans votre établissement, touchez : Utiliser ma position actuelle, pour le placer sur la carte." },
  @{ id = "t11"; show = "Étape quatre : vos contacts. Le téléphone public est obligatoire. Ajoutez aussi WhatsApp, l'e-mail et votre page Facebook."; say = "Étape quatre : vos contacts. Le téléphone public est obligatoire. Ajoutez aussi WhatsApp, l'e-mail et votre page Facebook." },
  @{ id = "t12"; show = "Étape cinq : ajoutez votre logo et jusqu'à 3 photos. Elles sont optimisées automatiquement."; say = "Étape cinq : ajoutez votre logo et jusqu'à trois photos. Elles sont optimisées automatiquement." },
  @{ id = "t13"; show = "Étape six : touchez « Envoyer pour validation ». Notre équipe vérifie votre fiche avant de la publier."; say = "Étape six : touchez : Envoyer pour validation. Notre équipe vérifie votre fiche avant de la publier." },
  @{ id = "t14"; show = "Suivez votre demande dans l'Espace pro. Une fois validée, votre fiche apparaît dans l'application."; say = "Suivez votre demande dans l'Espace pro. Une fois validée, votre fiche apparaît dans l'application." },
  @{ id = "t15"; show = "Ensuite, complétez vos horaires et votre catalogue avec vos prix, et répondez aux demandes de vos clients."; say = "Ensuite, complétez vos horaires et votre catalogue avec vos prix, et répondez aux demandes de vos clients." },
  @{ id = "t16"; show = "Boyoma Connect. Votre établissement, visible dans toute la Tshopo. C'est gratuit."; say = "Boyoma Connect. Votre établissement, visible dans toute la Tchopo. C'est gratuit." }
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
[System.IO.File]::WriteAllText((Join-Path $root "src\voice-tuto.json"), $json, (New-Object System.Text.UTF8Encoding $false))
