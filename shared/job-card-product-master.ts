// Job Card PRODUCT MASTER — fixed data transcribed from "job card.xlsx".
//
// This is the Excel product master referenced by the Job Card. The ordered mattress/model NAME is
// the matching key: find the model here, then read its layer descriptions, labels and consumer
// scheme. If a field is blank in Excel it is stored as "" here and must render blank on the card.
//
// Only this file changes when the Excel is updated. The app/order supplies the real-time data
// (order details, cutting/actual size, FARMA, special instructions, checked-by/date); this file
// supplies ONLY the layer/label/consumer-scheme/size-reduce columns keyed by model name.

export type JobCardLayerKey =
  | "topFabric"
  | "layer1"
  | "layer2"
  | "layer3"
  | "layer4"
  | "layer5"
  | "layer6"
  | "bottomFabric"
  | "borderFabric"
  | "piping";

/** The ordered rows shown in the Job Card "Layers" table (Column A of the Excel). */
export const JOB_CARD_LAYER_ROWS: Array<{ key: JobCardLayerKey; label: string }> = [
  { key: "topFabric", label: "Top Fabric" },
  { key: "layer1", label: "Layer 1" },
  { key: "layer2", label: "Layer 2" },
  { key: "layer3", label: "Layer 3" },
  { key: "layer4", label: "Layer 4" },
  { key: "layer5", label: "Layer 5" },
  { key: "layer6", label: "Layer 6" },
  { key: "bottomFabric", label: "Bottom Fabric" },
  { key: "borderFabric", label: "Border Fabric" },
  { key: "piping", label: "Piping" },
];

export type JobCardProductData = {
  /** Canonical model name (as spelled in the Excel header). */
  model: string;
  layers: Record<JobCardLayerKey, string>;
  /** labels 1 & 2 from the Excel. */
  label1: string;
  label2: string;
  /** Consumer scheme options from the Excel (blank string when the Excel cell is empty). */
  consumerScheme1: string;
  consumerScheme2: string;
  /** Inches to reduce EACH of length & width by to get the cutting size (Excel "SIZE REDUCE BY"). */
  sizeReduceInches: number;
};

// Transcribed verbatim from the Excel (blank cells kept blank). Column A rows -> object keys.
export const JOB_CARD_PRODUCT_MASTER: JobCardProductData[] = [
  {
    model: "Orthomatic",
    layers: {
      topFabric: "1109 memory quilt - white",
      layer1: "65mm copper profile",
      layer2: "72mm 9090 bonded",
      layer3: "",
      layer4: "",
      layer5: "",
      layer6: "",
      bottomFabric: "antiskid",
      borderFabric: "B7 - D02211",
      piping: "white",
    },
    label1: "BACKREST GOLDEN",
    label2: "SPINE ALIGNMENT",
    consumerScheme1: "2 Memory pillows",
    consumerScheme2: "1 Wedge queen Pillow",
    sizeReduceInches: 0.5,
  },
  {
    model: "Posturematic",
    layers: {
      topFabric: "1113 memory quilt - cream",
      layer1: "25mm 2150 coolgel memory",
      layer2: "50mm copper profile",
      layer3: "72mm 9090 bonded",
      layer4: "",
      layer5: "",
      layer6: "",
      bottomFabric: "antiskid",
      borderFabric: "B5 - D02211",
      piping: "brown and cream",
    },
    label1: "BACKREST GOLDEN",
    label2: "RELAXING COMFORT",
    consumerScheme1: "2 Memory pillows",
    consumerScheme2: "1 Wedge queen Pillow",
    sizeReduceInches: 0.5,
  },
  {
    model: "Theramatic",
    layers: {
      topFabric: "1107 memeory quilt - Grey",
      layer1: '2" Latex',
      layer2: "25mm copper",
      layer3: "72mm 9090 bonded",
      layer4: "",
      layer5: "",
      layer6: "",
      bottomFabric: "antiskid",
      borderFabric: "B4 - D2216",
      piping: "white and blue",
    },
    label1: "BACKREST GOLDEN",
    label2: "DUAL LAYER LAYEX",
    consumerScheme1: "2 Memory pillows",
    consumerScheme2: "1 Wedge queen Pillow",
    sizeReduceInches: 0.5,
  },
  {
    model: "Magnamatic",
    layers: {
      topFabric: "1006 hypersoft quilt - black orange",
      layer1: '1" hypersoft',
      layer2: "25mm copper",
      layer3: "felt",
      layer4: '5" spring',
      layer5: "felt",
      layer6: "",
      bottomFabric: "antiskid",
      borderFabric: "B6 - S04542",
      piping: "black",
    },
    label1: "BACKREST GOLDEN",
    label2: "ADAPTIVE SPRING TECH",
    consumerScheme1: "2 Memory pillows",
    consumerScheme2: "1 Wedge queen Pillow",
    sizeReduceInches: 0.5,
  },
  {
    model: "Spacematic",
    layers: {
      topFabric: "1124 memory quilt - white lavender",
      layer1: "50mm copper",
      layer2: "98mm 1545 profile",
      layer3: "",
      layer4: "",
      layer5: "",
      layer6: "",
      bottomFabric: "antiskid",
      borderFabric: "B9 - Sheetalnath belta 122",
      piping: "white and lavender",
    },
    label1: "BACKREST GOLDEN",
    label2: "MULTI ZONE TECH",
    consumerScheme1: "2 Memory pillows",
    consumerScheme2: "1 Wedge queen Pillow",
    sizeReduceInches: 0.5,
  },
  {
    model: "Delight",
    layers: {
      topFabric: "M-05 memory quilt black",
      layer1: "50mm copper",
      layer2: "30mm 9090 bonded",
      layer3: "40mm 2040",
      layer4: "30mm 9090 bonded",
      layer5: "",
      layer6: "",
      bottomFabric: "antiskid",
      borderFabric: "",
      piping: "black",
    },
    label1: "BACKREST GOLDEN",
    label2: "POSTURE CONTROL",
    consumerScheme1: "2 Memory pillows",
    consumerScheme2: "1 Wedge queen Pillow",
    sizeReduceInches: 0.5,
  },
  {
    model: "Delight Cool",
    layers: {
      topFabric: "1123 cool fabric",
      layer1: "40mm 4055 aircool",
      layer2: "20mm 1440",
      layer3: "30mm 9090 bonded",
      layer4: "40mm 2040",
      layer5: "30mm 9090 bonded",
      layer6: "",
      bottomFabric: "antiskid",
      borderFabric: "B8 - Green valvet",
      piping: "",
    },
    label1: "BACKREST GOLDEN",
    label2: "",
    consumerScheme1: "2 Memory pillows",
    consumerScheme2: "1 Wedge queen Pillow",
    sizeReduceInches: 0.5,
  },
  {
    model: "Delight Max",
    layers: {
      topFabric: "026 foam quilt",
      layer1: "30mm 9090 bonded",
      layer2: "40mm 2040",
      layer3: "30mm 9090 bonded",
      layer4: "",
      layer5: "",
      layer6: "",
      bottomFabric: "antiskid",
      borderFabric: "",
      piping: "white and cream",
    },
    label1: "BACKREST GOLDEN",
    label2: "ZERO SAG",
    consumerScheme1: "2 Memory pillows",
    consumerScheme2: "1 Wedge queen Pillow",
    sizeReduceInches: 0.5,
  },
  {
    model: "Latexo",
    layers: {
      topFabric: "1122 foam quilt - white",
      layer1: '1" latex',
      layer2: "25mm 2040",
      layer3: "30mm 9090 bonded",
      layer4: "40mm 2040",
      layer5: "30mm 9090 bonded",
      layer6: "",
      bottomFabric: "antiskid",
      borderFabric: "B3 - signature dior 09",
      piping: "white",
    },
    label1: "BACKREST GOLDEN",
    label2: "100% NATURAL LATEX",
    consumerScheme1: "2 Memory pillows",
    consumerScheme2: "1 Wedge queen Pillow",
    sizeReduceInches: 0.5,
  },
  {
    model: "Latexo Plush",
    layers: {
      topFabric: "1003 memory quilt - cream",
      layer1: '1" latex',
      layer2: "25mm 2040",
      layer3: "30mm 9090 bonded",
      layer4: "40mm 2040",
      layer5: "30mm 9090 bonded",
      layer6: "",
      bottomFabric: "antiskid",
      borderFabric: "B10 - signature dior 25",
      piping: "brown and grey",
    },
    label1: "BACKREST GOLDEN",
    label2: "100% NATURAL LATEX",
    consumerScheme1: "2 Memory pillows",
    consumerScheme2: "1 Wedge queen Pillow",
    sizeReduceInches: 0.5,
  },
  {
    model: "Aqua fresh",
    layers: {
      topFabric: "1105 foam quilt - cream",
      layer1: "50mm 3028 profile cool tech",
      layer2: "72mm 9080 bonded",
      layer3: "",
      layer4: "",
      layer5: "",
      layer6: "",
      bottomFabric: "1105 foam quilt - cream",
      borderFabric: "B1 - krishna regina 35",
      piping: "cream and white",
    },
    label1: "BACKREST GOLDEN",
    label2: "ORTHOPAEDIC SUPPORT",
    consumerScheme1: "2 Fiber pillows",
    consumerScheme2: "1 Wedge queen Pillow",
    sizeReduceInches: 0.5,
  },
  {
    model: "Aqua Fresh Plush",
    layers: {
      topFabric: "1103 memory quilt - white lavender",
      layer1: "50mm 3028 profile cool tech",
      layer2: "72mm 9080 bonded",
      layer3: "",
      layer4: "",
      layer5: "",
      layer6: "",
      bottomFabric: "1103 foam quilt - white lavender",
      borderFabric: "",
      piping: "white and lavender",
    },
    label1: "BACKREST GOLDEN",
    label2: "BALANCED COMFORT",
    consumerScheme1: "2 Fiber pillows",
    consumerScheme2: "1 Wedge queen Pillow",
    sizeReduceInches: 0.5,
  },
  {
    model: "Aqua Fresh Serene",
    layers: {
      topFabric: "1101 - memory quilt white",
      layer1: "25mm 2150 coolgel memory",
      layer2: "50mm 3028 profile cool tech",
      layer3: "72mm 9080 bonded",
      layer4: "",
      layer5: "",
      layer6: "",
      bottomFabric: "1101 - foam quilt white",
      borderFabric: "B2 - S06187",
      piping: "black and grey",
    },
    label1: "BACKREST GOLDEN",
    label2: "ENHANCES DEEP SLEEP",
    consumerScheme1: "2 Fiber pillows",
    consumerScheme2: "1 Wedge queen Pillow",
    sizeReduceInches: 0.5,
  },
  {
    model: "Aqua Fresh Bounce",
    layers: {
      topFabric: "1128 foam quilt - white orange",
      layer1: "25mm 1635",
      layer2: "felt",
      layer3: '5" spring',
      layer4: "felt",
      layer5: "",
      layer6: "",
      bottomFabric: "1128 foam quilt - white orange",
      borderFabric: "",
      piping: "orange and white",
    },
    label1: "BACKREST GOLDEN",
    label2: "AQUA BOUNCE PAPER",
    consumerScheme1: "2 Fiber pillows",
    consumerScheme2: "1 Wedge queen Pillow",
    sizeReduceInches: 0.5,
  },
  {
    model: "Ortho",
    layers: {
      topFabric: "1107 foam quilt - blue",
      layer1: "24mm 1632",
      layer2: "24mm 1340",
      layer3: "72mm 9080 bonded",
      layer4: "",
      layer5: "",
      layer6: "",
      bottomFabric: "1107 foam quilt - blue",
      borderFabric: "",
      piping: "white and blue",
    },
    label1: "BACKREST GOLDEN",
    label2: "ORTHO PAPER",
    consumerScheme1: "2 Fiber pillows",
    consumerScheme2: "1 Wedge queen Pillow",
    sizeReduceInches: 0.5,
  },
  {
    model: "Ortho Plush",
    layers: {
      topFabric: "1102 memory quilt grey",
      layer1: "24mm 1632",
      layer2: "24mm 1340",
      layer3: "72mm 9080 bonded",
      layer4: "",
      layer5: "",
      layer6: "",
      bottomFabric: "1102 foam quilt grey",
      borderFabric: "",
      piping: "black and grey",
    },
    label1: "BACKREST GOLDEN",
    label2: "ORTHO PLUSH PAPER",
    consumerScheme1: "2 Fiber pillows",
    consumerScheme2: "1 Wedge queen Pillow",
    sizeReduceInches: 0.5,
  },
  {
    model: "Ortho max",
    layers: {
      topFabric: "1119 foam quilt blue yellow",
      layer1: "13 mm 1340",
      layer2: "98mm 9080 bonded",
      layer3: "13 mm 1340",
      layer4: "",
      layer5: "",
      layer6: "",
      bottomFabric: "1119 foam quilt blue yellow",
      borderFabric: "",
      piping: "china blue",
    },
    label1: "BACKREST GOLDEN",
    label2: "ORTHO MAX PAPER",
    consumerScheme1: "2 Fiber pillows",
    consumerScheme2: "1 Wedge queen Pillow",
    sizeReduceInches: 0.5,
  },
  {
    model: "Ortho bond",
    layers: {
      topFabric: "1117 foam quilt dark blue",
      layer1: "24mm 1632",
      layer2: "24mm 1340",
      layer3: "48mm 9080 bonded",
      layer4: "",
      layer5: "",
      layer6: "",
      bottomFabric: "1117 foam quilt dark blue",
      borderFabric: "",
      piping: "dark blue and white",
    },
    label1: "BACKREST GOLDEN",
    label2: "ORTHO BOND PAPER",
    consumerScheme1: "2 Fiber pillows",
    consumerScheme2: "1 Wedge queen Pillow",
    sizeReduceInches: 0.5,
  },
];

/** Normalize a model name for matching: lowercase, collapse whitespace, drop punctuation. */
function normalizeModelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const MASTER_BY_NORMALIZED = new Map(
  JOB_CARD_PRODUCT_MASTER.map((p) => [normalizeModelName(p.model), p]),
);

/**
 * Look up the Excel product-master row for an ordered mattress/model name. Matching is tolerant of
 * case/spacing/punctuation. Returns null when the model isn't in the Excel (the caller then leaves
 * the Excel-sourced sections blank rather than inventing data).
 */
export function getJobCardProductData(modelName?: string | null): JobCardProductData | null {
  if (!modelName) return null;
  const norm = normalizeModelName(modelName);
  if (MASTER_BY_NORMALIZED.has(norm)) return MASTER_BY_NORMALIZED.get(norm)!;
  // Fall back to a contains match (e.g. "Ortho Plush 5 Years" -> "Ortho Plush"), preferring the
  // longest model name so "Ortho Plush" wins over "Ortho".
  const candidates = JOB_CARD_PRODUCT_MASTER.filter((p) => {
    const pn = normalizeModelName(p.model);
    return norm.includes(pn) || pn.includes(norm);
  }).sort((a, b) => b.model.length - a.model.length);
  return candidates[0] ?? null;
}
