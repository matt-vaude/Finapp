import { FastifyInstance } from "fastify";
import { prisma } from "../db";
import { parse } from "csv-parse/sync";
import crypto from "crypto";

/** =========================
 *  Utils parsing
 *  ========================= */

function normalizeAmountFR(raw: string) {
  const cleaned = (raw ?? "")
    .toString()
    .replace(/\s/g, "")
    .replace(",", ".")
    .trim();
  const n = Number(cleaned);
  if (Number.isNaN(n)) throw new Error(`Montant invalide: ${raw}`);
  return n;
}

function normalizeDate(raw: string) {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s);
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) throw new Error(`Date invalide: ${raw}`);
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  return new Date(Date.UTC(yyyy, mm - 1, dd));
}

// normalize header keys (remove accents, spaces, punctuation)
function normKey(s: string) {
  return (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function pickAny(obj: any, candidates: string[]) {
  // 1) direct
  for (const k of candidates) {
    if (obj[k] != null && String(obj[k]).trim() !== "") return String(obj[k]);
  }
  // 2) fuzzy
  const keys = Object.keys(obj);
  const map = new Map(keys.map((k) => [normKey(k), k]));
  for (const cand of candidates) {
    const real = map.get(normKey(cand));
    if (real && obj[real] != null && String(obj[real]).trim() !== "") return String(obj[real]);
  }
  return null;
}

/**
 * amountFromRow:
 * - si "Montant" existe => l'utiliser
 * - sinon si "Débit/Crédit" => crédit positif, débit négatif
 */
function amountFromRow(r: any) {
  const montant = pickAny(r, ["Montant", "Amount", "Valeur", "Value"]);
  if (montant) return normalizeAmountFR(montant);

  const debit = pickAny(r, ["Débit", "Debit", "DEBIT"]);
  const credit = pickAny(r, ["Crédit", "Credit", "CREDIT"]);

  if (credit) return Math.abs(normalizeAmountFR(credit));
  if (debit) return -Math.abs(normalizeAmountFR(debit));

  return null;
}

/** ID stable même si libellé change */
function makeTxId(dateISO: string, amount: number, balance?: string | null) {
  return crypto
    .createHash("sha256")
    .update(`${dateISO}|${amount}|${balance ?? ""}`)
    .digest("hex")
    .slice(0, 32);
}

/** =========================
 *  Auto-categorization
 *  ========================= */

type Rule = { re: RegExp; category: string };

function cleanLabel(raw: string) {
  let s = (raw ?? "").toString().trim();

  // Enlève préfixes bancaires fréquents
  s = s
    .replace(/^PAIEMENT\s+(CB|PSC)\s+\d{4}\s+/i, "")
    .replace(/^PRLV\s+SEPA\s+/i, "")
    .replace(/^VIR\s+(SEPA\s+)?/i, "")
    .replace(/\s+CARTE\s+\d{2,4}\b/gi, "")
    .replace(/\s+PAYWEB\d+\b/gi, "")
    .replace(/\s{2,}/g, " ");

  return s.trim();
}

// Règles revenus (amount > 0)
const INCOME_RULES: Rule[] = [
  { re: /DASSAULT/i, category: "Revenus / Salaire" },
  { re: /\bSALAIRE\b/i, category: "Revenus / Salaire" },
  { re: /\bCAF\b/i, category: "Revenus / CAF" },
  { re: /\bREMBOUR/i, category: "Revenus / Remboursement" },
  { re: /\bDIVID/i, category: "Revenus / Dividendes" },
  { re: /\bVIR\s+INST\b/i, category: "Revenus / Virement instantané" },
  { re: /\bVIR\s+PERMANENT\b/i, category: "Revenus / Virement permanent" },
];

// Règles dépenses/transferts (amount < 0) – très large couverture
const EXPENSE_RULES: Rule[] = [
  // Épargne / transferts
  { re: /\bPEL\b/i, category: "Épargne / PEL" },
  { re: /\bLIVRET\b|\bLDDS\b|\bLEP\b|\bAV\b|\bASSURANCE\s+VIE\b/i, category: "Épargne / Placements" },
  { re: /\bVIR\s+SEPA\b|\bVIREMENT\b/i, category: "Virements / Transferts" },

  // Logement / charges
  { re: /\bLOYER\b|\bFONCIA\b|\bNEXITY\b|\bCITYA\b|\bCDC\s+HABITAT\b/i, category: "Logement / Loyer" },
  { re: /\bEDF\b|\bENGIE\b|\bTOTALENERGIES\b|\bGDF\b/i, category: "Logement / Énergie" },
  { re: /\bVEOLIA\b|\bSUEZ\b|\bEAU\b/i, category: "Logement / Eau" },
  { re: /\bORANGE\b|\bSFR\b|\bFREE\b|\bBOUYGUES\b/i, category: "Abonnements / Télécom" },

  // Assurances
  { re: /\bASSURANCE\b|\bACCIDENTS\s+DE\s+LA\s+VIE\b|\bPREVOYANCE\b/i, category: "Assurances / Prévoyance" },
  { re: /\bAUTOMOBILE\b|\bAUTO\b|\bMAIF\b|\bMACIF\b|\bAXA\b|\bALLIANZ\b/i, category: "Assurances / Auto" },

  // Abonnements digitaux
  { re: /\bSPOTIFY\b/i, category: "Abonnements / Spotify" },
  { re: /\bNETFLIX\b/i, category: "Abonnements / Netflix" },
  { re: /\bDISNEY\b/i, category: "Abonnements / Disney+" },
  { re: /\bAMAZON\s+PRIME\b|\bPRIME\b/i, category: "Abonnements / Amazon Prime" },
  { re: /\bAPPLE\b|\bCOM\/BILL\b/i, category: "Abonnements / Apple" },
  { re: /\bMICROSOFT\b|\bMSBILL\b|\bSUBSCR\b/i, category: "Abonnements / Microsoft" },
  { re: /\bOPENAI\b|\bCHATGPT\b/i, category: "Abonnements / IA" },
  { re: /\bOVH\b|\bGITHUB\b|\bDROPBOX\b|\bNOTION\b|\bADOBE\b/i, category: "Abonnements / Services web" },

  // Transport
  { re: /\bIMAGINE\s+R\b|\bNAVIGO\b|\bRATP\b/i, category: "Transport / Navigo" },
  { re: /\bSNCF\b|\bOUIGO\b|\bTGV\b/i, category: "Transport / Train" },
  { re: /\bUBER\b|\bUBR\*?\b|\bBOLT\b|\bHEETCH\b|\bFREENOW\b/i, category: "Transport / VTC" },
  { re: /\bPARKING\b|\bINDIGO\b|\bVINCI\s+PARK\b/i, category: "Transport / Parking" },
  { re: /\bTOTAL\b|\bESSO\b|\bSHELL\b|\bBP\b/i, category: "Transport / Carburant" },

  // Courses
  { re: /\bCARREFOUR\b|\bAUCHAN\b|\bLECLERC\b|\bINTERMARCHE\b|\bLIDL\b|\bALDI\b|\bMONOPRIX\b|\bFRANPRIX\b|\bPICARD\b|\bBIOCOOP\b/i, category: "Courses / Supermarché" },

  // Restaurants / sorties
  { re: /\bMCDONALD\b|\bBURGER\s+KING\b|\bKFC\b|\bSUBWAY\b|\bFIVE\s+GUYS\b|\bSTARBUCKS\b|\bDOMINO'?S\b|\bDEL\s+ARTE\b/i, category: "Restaurants / Fast-food" },
  { re: /\bSUSHI\b|\bPIZZA\b|\bHIPPOPOTAMUS\b|\bBRASSERIE\b|\bRESTAUR/i, category: "Restaurants / Sorties" },
  { re: /\bDELIVEROO\b|\bUBER\s*EATS\b|\bJUST\s*EAT\b|\bNYX\*NYXEASYMEAL\b/i, category: "Restaurants / Livraison" },

  // Shopping
  { re: /\bAMAZON\b/i, category: "Shopping / Amazon" },
  { re: /\bFNAC\b|\bDARTY\b|\bBOULANGER\b|\bIKEA\b|\bDECATHLON\b/i, category: "Shopping / Magasins" },
  { re: /\bLEBONCOIN\b|\bVINTED\b/i, category: "Shopping / Occasion" },
  { re: /\bPAYPAL\b/i, category: "Paiements / PayPal" },

  // Santé
  { re: /\bPHARM\b|\bDOCTOLIB\b|\bCLINIQUE\b|\bHOPITAL\b|\bLABORATOIRE\b|\bOPTIC\b|\bDENT/i, category: "Santé / Soins" },

  // Impôts / taxes / amendes
  { re: /\bDGFIP\b|\bIMPOT\b|\bTAXE\b/i, category: "Impôts / Taxes" },
  { re: /\bAMENDE\b|\bANTAI\b/i, category: "Impôts / Amendes" },

  // Jeux / paris
  { re: /\bFDJ\b|\bPMU\b|\bWINAMAX\b|\bUNIBET\b|\bPOKERSTARS\b/i, category: "Loisirs / Jeux" },

  // Banque / frais
  { re: /\bFRAIS\b|\bCOTIS\b|\bAGIOS\b|\bCOMMISSION\b/i, category: "Frais / Bancaires" },

  // Terminaux (SUMUP / Zettle etc.) => “Paiements / Marchands”
  { re: /\bSUMUP\b|\bZETTLE\b|\bSQUARE\b/i, category: "Paiements / Marchands" },

  // Petits libellés “BOULOGNE-BILL ...” (souvent micro paiements)
  { re: /\bBOULOGNE-?BILL\b/i, category: "Divers / Petites dépenses" },
];

function guessCategory(label: string, amount: number) {
  const raw = (label ?? "").toString();
  const cleaned = cleanLabel(raw);
  const upper = cleaned.toUpperCase();

  // revenus
  if (amount > 0) {
    for (const rule of INCOME_RULES) {
      if (rule.re.test(upper)) return rule.category;
    }
    // heuristique: virements instant/papa etc.
    if (upper.includes("VIR") || upper.includes("VIREMENT")) return "Revenus / Virement";
    return "Revenus / Autres";
  }

  // dépenses/transferts
  for (const rule of EXPENSE_RULES) {
    if (rule.re.test(upper)) return rule.category;
  }

  // heuristiques génériques
  if (upper.includes("PRLV")) return "Abonnements / Prélèvements";
  if (upper.includes("PAIEMENT")) return "Dépenses / Carte";
  if (upper.includes("RETRAIT") || upper.includes("DAB")) return "Cash / Retraits";

  return "Non catégorisé";
}

/** =========================
 *  Prisma helpers (cache)
 *  ========================= */

function normalizeCategoryName(name: string) {
  return (name ?? "").toString().trim().replace(/\s{2,}/g, " ");
}

export function registerImportRoutes(app: FastifyInstance) {
  app.post("/imports/csv", async (req, reply) => {
    const { sub: userId } = await (req as any).jwtVerify();

    const file = await (req as any).file();
    if (!file) return reply.code(400).send({ error: "Fichier manquant" });

    const buffer: Buffer = await file.toBuffer();

    // Fix encodage : si UTF8 contient beaucoup de '�', fallback latin1
    let content = buffer.toString("utf8");
    const bad = (content.match(/�/g) || []).length;
    if (bad > 2) content = buffer.toString("latin1");

    const delimiter = content.includes(";") ? ";" : ",";

    let records: any[] = [];
    try {
      records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        delimiter,
        bom: true,
        trim: true,
      });
    } catch (e: any) {
      return reply.code(400).send({ error: "CSV illisible", message: e?.message ?? String(e) });
    }

    const headers = records.length ? Object.keys(records[0]) : [];

    // Compte CSV unique par user
    const account = await prisma.account.upsert({
      where: { providerAccountId: `csv_${userId}` },
      update: {},
      create: {
        userId,
        providerAccountId: `csv_${userId}`,
        name: "Compte CSV",
        currency: "EUR",
        connectionId: null as any,
      },
    });

    // cache catégories (name -> id)
    const categoryCache = new Map<string, string>();

    async function getOrCreateCategoryId(name: string) {
      const norm = normalizeCategoryName(name);
      const cached = categoryCache.get(norm);
      if (cached) return cached;

      const existing = await prisma.category.findFirst({
        where: { userId, name: norm },
        select: { id: true },
      });

      if (existing) {
        categoryCache.set(norm, existing.id);
        return existing.id;
      }

      const created = await prisma.category.create({
        data: { userId, name: norm },
        select: { id: true },
      });

      categoryCache.set(norm, created.id);
      return created.id;
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    const errorsSample: Array<{ row: number; reason: string }> = [];
    const autoCatCounts: Record<string, number> = {};

    for (let i = 0; i < records.length; i++) {
      const r = records[i];

      const dateRaw = pickAny(r, [
        "Date",
        "Date d'analyse",
        "Date de valeur",
        "Date operation",
        "Date d'operation",
        "Date d’opération",
      ]);

      const label =
        pickAny(r, ["Libellé", "Libelle", "Libell", "Description", "Motif"]) ?? "Transaction";

      const balanceRaw = pickAny(r, ["Solde", "Balance"]);

      // catégories si le CSV les fournit
      const cat = pickAny(r, ["Catégorie", "Categorie", "Category"]);
      const subcat = pickAny(r, ["Sous-catégorie", "Sous-categorie", "Subcategory"]);

      if (!dateRaw) {
        skipped++;
        if (errorsSample.length < 15) errorsSample.push({ row: i + 2, reason: `date manquante` });
        continue;
      }

      let date: Date;
      let amount: number | null = null;

      try {
        date = normalizeDate(dateRaw);
        amount = amountFromRow(r);
      } catch (e: any) {
        skipped++;
        if (errorsSample.length < 15) errorsSample.push({ row: i + 2, reason: e?.message ?? "date/montant invalide" });
        continue;
      }

      if (amount == null) {
        skipped++;
        if (errorsSample.length < 15) errorsSample.push({ row: i + 2, reason: `montant introuvable (Montant ou Débit/Crédit)` });
        continue;
      }

      // Nom de catégorie : priorité CSV, sinon auto-catégorisation
      let categoryName: string | null =
        cat && subcat ? `${cat} / ${subcat}` :
        cat ? cat :
        subcat ? subcat :
        null;

      let wasAuto = false;
      if (!categoryName) {
        categoryName = guessCategory(label, amount);
        wasAuto = true;
      }

      categoryName = normalizeCategoryName(categoryName);

      let categoryId: string | null = null;
      if (categoryName && categoryName !== "Non catégorisé") {
        categoryId = await getOrCreateCategoryId(categoryName);
        if (wasAuto) autoCatCounts[categoryName] = (autoCatCounts[categoryName] ?? 0) + 1;
      } else {
        categoryId = null;
      }

      const providerTxId = makeTxId(date.toISOString().slice(0, 10), amount, balanceRaw);

      // count import/update (sans heuristique createdAt)
      const existed = await prisma.transaction.findUnique({
        where: { accountId_providerTxId: { accountId: account.id, providerTxId } },
        select: { id: true },
      });

      await prisma.transaction.upsert({
        where: { accountId_providerTxId: { accountId: account.id, providerTxId } },
        update: {
          label,
          categoryId,
          amount,
          date,
          currency: "EUR",
        },
        create: {
          accountId: account.id,
          providerTxId,
          date,
          amount,
          currency: "EUR",
          label,
          categoryId,
        },
      });

      if (existed) updated++;
      else imported++;
    }

    // top 20 catégories auto
    const autoTop = Object.entries(autoCatCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, count]) => ({ name, count }));

    return {
      ok: true,
      imported,
      updated,
      skipped,
      totalRows: records.length,
      headers,
      errorsSample,
      delimiter,
      autoCategorizedTop: autoTop,
    };
  });
}
