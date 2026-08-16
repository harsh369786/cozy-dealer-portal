import mattress from "@/assets/mattress-premium.jpg";
import pillow from "@/assets/pillow-memory.jpg";
import cushion from "@/assets/cushion-support.jpg";

export type Product = {
  id: string;
  name: string;
  category: "Mattresses" | "Pillows" | "Cushions";
  blurb: string;
  benefits: string[];
  sizes: string[];
  price: number;
  points: number;
  image: string;
};

export const products: Product[] = [
  {
    id: "premium-comfort-mattress",
    name: "Premium Comfort Mattress",
    category: "Mattresses",
    blurb: "Medium-firm memory foam for deep, undisturbed sleep.",
    benefits: ["Cool gel top layer", "7-zone back support", "10 year warranty"],
    sizes: ['72 × 60"', '72 × 66"', '78 × 60"', '78 × 72"'],
    price: 4500,
    points: 50,
    image: mattress,
  },
  {
    id: "ortho-support-mattress",
    name: "Ortho Support Mattress",
    category: "Mattresses",
    blurb: "Firm orthopaedic base recommended for back comfort.",
    benefits: ["High density foam", "Anti-sag edges", "Breathable cover"],
    sizes: ['72 × 60"', '75 × 66"', '78 × 72"'],
    price: 5200,
    points: 60,
    image: mattress,
  },
  {
    id: "cloud-memory-pillow",
    name: "Cloud Memory Pillow",
    category: "Pillows",
    blurb: "Soft memory foam that keeps its shape night after night.",
    benefits: ["Neck alignment", "Washable cover", "Dust-mite safe"],
    sizes: ['24 × 16"', '27 × 17"'],
    price: 850,
    points: 12,
    image: pillow,
  },
  {
    id: "backrest-support-cushion",
    name: "BackRest Support Cushion",
    category: "Cushions",
    blurb: "Everyday lumbar cushion for chairs, cars and shop counters.",
    benefits: ["Lumbar curve", "Non-slip strap", "Soft knit fabric"],
    sizes: ['16 × 16"', '18 × 18"'],
    price: 640,
    points: 8,
    image: cushion,
  },
];

export const getProduct = (id: string) => products.find((p) => p.id === id) ?? products[0]!;

export const dealer = {
  name: "Rajesh",
  shop: "Sharma Furnishings, Nagpur",
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

export const pointsHistory = [
  { label: "Order #BR1024", value: 500, date: "12 Aug" },
  { label: "Campaign Bonus", value: 250, date: "05 Aug" },
  { label: "Bluetooth Speaker", value: -3000, date: "28 Jul" },
  { label: "Order #BR0998", value: 700, date: "21 Jul" },
];

export const orders = [
  {
    id: "BR1024",
    product: "Premium Comfort Mattress",
    detail: '10 × 72 × 60"',
    amount: 45000,
    placed: "12 Aug 2026",
    step: 3,
  },
  {
    id: "BR1019",
    product: "Cloud Memory Pillow",
    detail: '40 × 24 × 16"',
    amount: 34000,
    placed: "04 Aug 2026",
    step: 4,
  },
  {
    id: "BR0998",
    product: "Ortho Support Mattress",
    detail: '12 × 78 × 72"',
    amount: 62400,
    placed: "21 Jul 2026",
    step: 4,
  },
];

export const orderSteps = ["Order Placed", "Approved", "Being Made", "Ready to Send", "Delivered"];

export const campaigns = [
  {
    id: "monsoon",
    title: "MONSOON MATTRESS BONANZA",
    emoji: "🌧️",
    goal: "Sell 20 Premium Mattresses",
    reward: "5,000 Bonus Points",
    done: 12,
    target: 20,
    ends: "30 Sep 2026",
  },
  {
    id: "sell-more",
    title: "SELL MORE. EARN MORE.",
    emoji: "🔥",
    goal: "Sell 10 more Premium Mattresses",
    reward: "1,500 Bonus Points",
    done: 6,
    target: 10,
    ends: "15 Sep 2026",
  },
  {
    id: "pillow-push",
    title: "PILLOW POWER WEEK",
    emoji: "☁️",
    goal: "Sell 50 Cloud Memory Pillows",
    reward: "2,000 Bonus Points",
    done: 38,
    target: 50,
    ends: "22 Aug 2026",
  },
];

export const inr = (n: number) => "₹" + n.toLocaleString("en-IN");
