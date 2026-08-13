# Guide d'intégration MTarget SMS

## Présentation

MTarget est un opérateur SMS qui expose une API REST simple en `application/x-www-form-urlencoded`. L'envoi d'un SMS se fait en un seul appel HTTP POST.

---

## Credentials nécessaires

Obtenir auprès de MTarget :

| Credential | Description |
|------------|-------------|
| `username` | Identifiant du compte MTarget |
| `password` | Mot de passe du compte MTarget |
| `serviceId` | Identifiant du service SMS (fourni par MTarget) |
| `sender` | Nom de l'expéditeur affiché sur le téléphone (ex: `EasyArena`) — max 11 caractères alphanumériques |

---

## Endpoint

```
POST https://api-public-2.mtarget.fr/messages
Content-Type: application/x-www-form-urlencoded
```

### Paramètres du body

| Paramètre | Type | Description |
|-----------|------|-------------|
| `username` | string | Identifiant MTarget |
| `password` | string | Mot de passe MTarget |
| `msisdn` | string | Numéro du destinataire au format `00XXXXXXXXXXX` |
| `sender` | string | Nom de l'expéditeur |
| `serviceid` | string | ID du service |
| `msg` | string | Contenu du SMS (UTF-8) |

### Format du numéro (`msisdn`)

MTarget requiert le préfixe `00` (et non `+`) :

```
+221771234567  →  00221771234567
221771234567   →  221771234567   (laisser tel quel si pas de +)
```

---

## Réponse

```json
{
  "results": [
    {
      "msisdn": "00221771234567",
      "reason": "ACCEPTED"
    }
  ]
}
```

- `reason: "ACCEPTED"` → SMS accepté et mis en file d'envoi ✓
- Toute autre valeur (`REJECTED`, `INVALID_MSISDN`, etc.) → erreur à traiter

---

## Implémentation de référence (TypeScript / NestJS)

```typescript
async function sendSms(phone: string, message: string): Promise<void> {
  const username  = process.env.MTARGET_USERNAME!;
  const password  = process.env.MTARGET_PASSWORD!;
  const serviceId = process.env.MTARGET_SERVICE_ID!;
  const sender    = process.env.MTARGET_SENDER ?? 'EasyArena';

  // Convertir +XXX → 00XXX
  const msisdn = phone.startsWith('+') ? '00' + phone.slice(1) : phone;

  const params = new URLSearchParams({
    username,
    password,
    msisdn,
    sender,
    serviceid: serviceId,
    msg: message,
  });

  const response = await fetch('https://api-public-2.mtarget.fr/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`MTarget HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const reason = data.results?.[0]?.reason;

  if (reason !== 'ACCEPTED') {
    throw new Error(`MTarget a rejeté le SMS vers ${phone} : ${reason}`);
  }
}
```

### Implémentation Python (requests)

```python
import requests

def send_sms(phone: str, message: str) -> None:
    username   = os.environ["MTARGET_USERNAME"]
    password   = os.environ["MTARGET_PASSWORD"]
    service_id = os.environ["MTARGET_SERVICE_ID"]
    sender     = os.environ.get("MTARGET_SENDER", "EasyArena")

    msisdn = "00" + phone[1:] if phone.startswith("+") else phone

    response = requests.post(
        "https://api-public-2.mtarget.fr/messages",
        data={
            "username": username,
            "password": password,
            "msisdn": msisdn,
            "sender": sender,
            "serviceid": service_id,
            "msg": message,
        },
    )
    response.raise_for_status()

    result = response.json()
    reason = result.get("results", [{}])[0].get("reason")
    if reason != "ACCEPTED":
        raise Exception(f"MTarget a rejeté le SMS vers {phone} : {reason}")
```

---

## Variables d'environnement

```env
SMS_PROVIDER_NAME=mtarget

MTARGET_USERNAME=votre_username
MTARGET_PASSWORD=votre_password
MTARGET_SERVICE_ID=votre_service_id
MTARGET_SENDER=EasyArena
```

---

## Pattern mock pour les environnements de dev/test

En développement, il est recommandé de ne pas appeler MTarget. Utiliser un mock qui logue simplement le SMS :

```typescript
// mock.provider.ts
async function sendSms(phone: string, message: string): Promise<void> {
  console.log(`[SMS MOCK] → ${phone}: ${message}`);
}
```

Basculer entre les deux via la variable `SMS_PROVIDER_NAME` :
- `mtarget` → appel réel à l'API MTarget
- tout autre valeur / absent → mock

---

## Points d'attention

- Le `sender` est limité à **11 caractères** alphanumériques (sans espaces ni caractères spéciaux) pour la plupart des opérateurs
- Les SMS longs (> 160 caractères GSM7 ou > 70 caractères Unicode) sont automatiquement découpés en plusieurs parties et facturés en conséquence
- MTarget opère principalement en Afrique de l'Ouest (Sénégal, Côte d'Ivoire, etc.) — vérifier la couverture pour d'autres régions
- L'API ne supporte pas d'authentification par header (Bearer, Basic) — les credentials passent uniquement dans le body du POST
