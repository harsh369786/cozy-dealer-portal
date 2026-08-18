import mattress from "@/assets/mattress-premium.jpg";
import pillow from "@/assets/pillow-memory.jpg";
import cushion from "@/assets/cushion-support.jpg";

export type Product = {
  id: string;
  name: string;
  category: "Mattresses" | "Foldable" | "Pillows";
  guarantee: string;
  thicknesses: string[];
  fixedSize?: string;
  mrp: number;
  price: number;
  points: number;
  free?: string;
  blurb: string;
  image: string;
};

const M = (
  name: string,
  guarantee: string,
  thicknesses: string[],
  mrp: number,
  price: number,
  points: number,
  blurb: string,
): Product => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  name,
  category: "Mattresses",
  guarantee,
  thicknesses,
  mrp,
  price,
  points,
  free: "2 × Fiber Pillows",
  blurb,
  image: mattress,
});

export const products: Product[] = [
  M("Eco Bond", "3 Years", ['4"'], 5200, 3400, 24, "Everyday value bonded foam mattress."),

  M("Twin", "5 Years", ['5"', '6"', '8"'], 7900, 5300, 36, "Balanced comfort for daily sleep."),
  M("Twin Plush", "5 Years", ['5"', '6"', '8"'], 8600, 5800, 40, "Softer top feel with firm base."),
  M("Twin Max", "5 Years", ['5"', '6"', '8"'], 9400, 6300, 44, "Extra support for heavier use."),

  M("AquaFresh", "7 Years", ['5"', '6"', '8"'], 11200, 7500, 52, "Breathable cool-sleep foam."),
  M(
    "AquaFresh Plush",
    "7 Years",
    ['5"', '6"', '8"'],
    12100,
    8100,
    56,
    "Plush surface, cool and airy.",
  ),
  M(
    "AquaFresh Serene",
    "7 Years",
    ['5"', '6"', '8"'],
    12900,
    8700,
    60,
    "Quiet, calm, pressure-free sleep.",
  ),
  M(
    "AquaFresh Bounce",
    "7 Years",
    ['5"', '6"', '8"'],
    13400,
    9000,
    62,
    "Springy feel with quick recovery.",
  ),

  M("Delight", "10 Years", ['5"', '6"', '8"'], 15200, 10200, 70, "Premium comfort for long life."),
  M("Delight Max", "10 Years", ['4"'], 12400, 8300, 58, "Slim profile, maximum support."),
  M(
    "Delight Cool",
    "10 Years",
    ['5"', '6"', '8"'],
    16400,
    11000,
    76,
    "Cool gel layer for hot nights.",
  ),
  M(
    "Latexo",
    "10 Years",
    ['5"', '6"', '8"'],
    18600,
    12500,
    86,
    "Natural latex bounce and breathability.",
  ),
  M(
    "Latexo Plush",
    "10 Years",
    ['5"', '6"', '8"'],
    19900,
    13400,
    92,
    "Soft latex top with firm core.",
  ),

  M(
    "Orthomatic",
    "12 Years",
    ['6"', '8"', '10"'],
    22400,
    15100,
    104,
    "Orthopaedic support for back comfort.",
  ),
  M(
    "Posturematic",
    "12 Years",
    ['6"', '8"', '10"'],
    23600,
    15900,
    110,
    "Posture-aligned zoned support.",
  ),
  M(
    "Theramatic",
    "12 Years",
    ['6"', '8"', '10"'],
    24800,
    16700,
    116,
    "Therapeutic relief for pressure points.",
  ),
  M(
    "Magnamatic",
    "12 Years",
    ['6"', '8"', '10"'],
    26200,
    17600,
    122,
    "Magnetic therapy comfort layer.",
  ),
  M(
    "Spacematic",
    "12 Years",
    ['6"', '8"', '10"'],
    27800,
    18700,
    130,
    "Top of the range luxury sleep.",
  ),

  {
    id: "2-fold-mattress",
    name: "2 Fold Mattress",
    category: "Foldable",
    guarantee: "Foldable",
    thicknesses: ['2"', '3"'],
    fixedSize: "36 × 72",
    mrp: 4200,
    price: 2800,
    points: 20,
    free: "2 × Fiber Pillows",
    blurb: "Folds in two — easy to store and carry.",
    image: cushion,
  },
  {
    id: "3-fold-mattress",
    name: "3 Fold Mattress",
    category: "Foldable",
    guarantee: "Foldable",
    thicknesses: ['2"', '3"'],
    fixedSize: "36 × 72",
    mrp: 4600,
    price: 3100,
    points: 22,
    free: "2 × Fiber Pillows",
    blurb: "Folds in three — perfect for guests.",
    image: cushion,
  },
];

const P = (name: string, size: string, mrp: number, price: number, points: number): Product => ({
  id: "pillow-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  name,
  category: "Pillows",
  guarantee: "Pillow",
  thicknesses: [],
  fixedSize: size,
  mrp,
  price,
  points,
  blurb: `${size} pillow`,
  image: pillow,
});

export const pillows: Product[] = [
  P("Memory King", "17 × 27", 1400, 950, 8),
  P("Memory Queen", "16 × 24", 1200, 820, 7),
  P("Contour King", "17 × 27", 1600, 1080, 9),
  P("Latex", "17 × 27", 1900, 1290, 11),
  P("Fiber", "16 × 24", 700, 460, 4),
  P("Wedge King", "24 × 24 × 10", 2200, 1490, 13),
  P("Wedge Queen", "18 × 20 × 9", 1800, 1220, 10),
];

export const allProducts: Product[] = [...products, ...pillows];

export const getProduct = (id: string) => allProducts.find((p) => p.id === id) ?? allProducts[0]!;

export const MATTRESS_LAYERS = [
  {
    id: "layer-1",
    title: "3 & 5 Years Guarantee",
    subgroups: [
      { label: "3 Years", productIds: ["eco-bond"] },
      { label: "5 Years", productIds: ["twin", "twin-plush", "twin-max"] },
    ],
  },
  {
    id: "layer-2",
    title: "7 Years Guarantee",
    productIds: ["aquafresh", "aquafresh-plush", "aquafresh-serene", "aquafresh-bounce"],
  },
  {
    id: "layer-3",
    title: "10 Years Guarantee",
    productIds: ["delight", "delight-max", "delight-cool", "latexo", "latexo-plush"],
  },
  {
    id: "layer-4",
    title: "12 Years Guarantee",
    productIds: ["orthomatic", "posturematic", "theramatic", "magnamatic", "spacematic"],
  },
] as const;

export const salespeople = ["Amit", "Rahul", "Sameer", "Priya"] as const;

export type PriceCampaign = {
  id: string;
  name: string;
  productId: string;
  discountPercent: number;
  startAt: string;
  endAt: string;
  description: string;
  terms?: string;
  badgeLabel?: string;
};

/** Mock admin-configured price campaigns — replace with API in production. */
export const priceCampaigns: PriceCampaign[] = [
  {
    id: "motw-latexo-aug",
    name: "Mattress of the Week",
    productId: "latexo",
    discountPercent: 5,
    startAt: "2026-08-11T00:00:00+05:30",
    endAt: "2026-08-27T23:59:59+05:30",
    description:
      "Get an extra 5% off on Latexo — our natural latex mattress with premium bounce and breathability.",
    terms:
      "Valid on standard dealer orders during the campaign period. Cannot be combined with other offers.",
    badgeLabel: "Extra 5% OFF",
  },
];

export type Order = {
  id: string;
  product: string;
  size: string;
  thickness: string;
  quantity: number;
  dealer: string;
  customer?: { name?: string; mobile?: string; address?: string; email?: string };
  status: string;
  placed: string;
  amount: number;
  step: number;
  detail: string;
};

export const orderRecords: Order[] = [
  {
    id: "BR1024",
    product: "Orthomatic",
    size: "78 × 60",
    thickness: '6"',
    quantity: 2,
    dealer: "Sharma Furnishings, Nagpur",
    customer: { name: "Vikram Patel", mobile: "+91 98220 11223", address: "Civil Lines, Nagpur" },
    status: "Ready to Send",
    placed: "12 Aug 2026",
    amount: 30200,
    step: 3,
    detail: '2 × 78 × 60 × 6"',
  },
  {
    id: "BR1019",
    product: "AquaFresh Plush",
    size: "72 × 36",
    thickness: '5"',
    quantity: 1,
    dealer: "Sharma Furnishings, Nagpur",
    customer: { name: "Anita Desai", mobile: "+91 97654 88990" },
    status: "Delivered",
    placed: "04 Aug 2026",
    amount: 8100,
    step: 4,
    detail: '1 × 72 × 36 × 5"',
  },
  {
    id: "BR0998",
    product: "Delight Cool",
    size: "75 × 60",
    thickness: '8"',
    quantity: 3,
    dealer: "Sharma Furnishings, Nagpur",
    status: "Delivered",
    placed: "21 Jul 2026",
    amount: 33000,
    step: 4,
    detail: '3 × 75 × 60 × 8"',
  },
];

export const getOrderById = (id: string) => {
  const normalized = id.trim().toUpperCase().replace(/^#/, "");
  return orderRecords.find((o) => o.id.toUpperCase() === normalized) ?? null;
};

export type ComplaintStatus = "Pending" | "Under Review" | "In Progress" | "Resolved" | "Closed";

export type Complaint = {
  id: string;
  orderId: string;
  description: string;
  status: ComplaintStatus;
  submitted: string;
  step: number;
};

export const complaintSteps: ComplaintStatus[] = [
  "Pending",
  "Under Review",
  "In Progress",
  "Resolved",
  "Closed",
];

export const sampleComplaints: Complaint[] = [
  {
    id: "CMP-10245",
    orderId: "BR1019",
    description: "Mattress has a slight sag on one side after delivery.",
    status: "In Progress",
    submitted: "14 Aug 2026",
    step: 2,
  },
];

export const LENGTHS = [72, 75, 78, 84];
export const BREADTHS = [30, 36, 48, 60, 66, 72, 75, 78, 84];

export const FREE_ITEM = { label: "2 × Fiber Pillows", value: 920 };

export const dealer = {
  name: "Rajesh",
  shop: "Sharma Furnishings, Nagpur",
  phone: "+91 98765 43210",
  points: 2450,
  nextRewardAt: 3000,
  nextReward: "Bluetooth Speaker",
};

export const rewards = [
  { id: "speaker", name: "Bluetooth Speaker", emoji: "🎁", points: 3000 },
  { id: "backpack", name: "BackRest Backpack", emoji: "🎒", points: 5000 },
  { id: "earbuds", name: "Wireless Earbuds", emoji: "🎧", points: 8000 },
  { id: "watch", name: "Smart Watch", emoji: "⌚", points: 12000 },
];

export type RewardClaim = {
  id: string;
  name: string;
  emoji: string;
  claimed: string;
  status: "Delivered" | "Pending";
  delivered?: string;
};

export const rewardHistory: RewardClaim[] = [
  {
    id: "c1",
    name: "Bluetooth Speaker",
    emoji: "🎁",
    claimed: "10 Aug 2026",
    status: "Delivered",
    delivered: "14 Aug 2026",
  },
  { id: "c2", name: "Bluetooth Speaker", emoji: "🎁", claimed: "25 Jul 2026", status: "Pending" },
  {
    id: "c3",
    name: "BackRest Backpack",
    emoji: "🎒",
    claimed: "10 Jul 2026",
    status: "Delivered",
    delivered: "15 Jul 2026",
  },
  { id: "c4", name: "Wireless Earbuds", emoji: "🎧", claimed: "02 Jul 2026", status: "Pending" },
];

export const pointsHistory = [
  { label: "Order #BR1024", value: 500, date: "12 Aug" },
  { label: "Campaign Bonus", value: 250, date: "05 Aug" },
  { label: "Bluetooth Speaker", value: -3000, date: "28 Jul" },
  { label: "Order #BR0998", value: 700, date: "21 Jul" },
];

export const orders = orderRecords.map((o) => ({
  id: o.id,
  product: o.product,
  detail: o.detail,
  amount: o.amount,
  placed: o.placed,
  step: o.step,
}));

export const orderSteps = ["Order Placed", "Approved", "Being Made", "Ready to Send", "Delivered"];

export const campaigns = [
  {
    id: "monsoon",
    title: "MONSOON MATTRESS BONANZA",
    emoji: "🌧️",
    goal: "Sell 20 Orthomatic Mattresses",
    reward: "5,000 Bonus Points",
    done: 12,
    target: 20,
    ends: "30 Sep 2026",
  },
  {
    id: "sell-more",
    title: "SELL MORE. EARN MORE.",
    emoji: "🔥",
    goal: "Sell 10 more Delight Mattresses",
    reward: "1,500 Bonus Points",
    done: 6,
    target: 10,
    ends: "15 Sep 2026",
  },
  {
    id: "pillow-push",
    title: "PILLOW POWER WEEK",
    emoji: "☁️",
    goal: "Sell 50 Memory King Pillows",
    reward: "2,000 Bonus Points",
    done: 38,
    target: 50,
    ends: "22 Aug 2026",
  },
];

export const inr = (n: number) => "₹" + n.toLocaleString("en-IN");
