export const vendors = [
  {
    id: "forma",
    name: "Forma Studio",
    location: "Portland, OR",
    initials: "fs",
    color: "#e8edf8",
    description: "Thoughtful objects for everyday rituals.",
  },
  {
    id: "common",
    name: "Common Goods",
    location: "Brooklyn, NY",
    initials: "cg",
    color: "#eaf0e8",
    description: "Useful things, made to stay with you.",
  },
  {
    id: "still",
    name: "Still & Co.",
    location: "Austin, TX",
    initials: "s&",
    color: "#f3e9e1",
    description: "Small comforts for a slower home.",
  },
];
export const products = [
  {
    id: "ceramic-mug",
    vendorId: "forma",
    name: "Everyday ceramic mug",
    category: "Home",
    price: 2800,
    stock: 18,
    image: "/products/mug.jpg",
    tag: "Small batch",
    description:
      "A quiet companion for your morning coffee. Glazed ceramic, 350 ml.",
  },
  {
    id: "ceramic-vase",
    vendorId: "forma",
    name: "Sculpture vase",
    category: "Home",
    price: 4800,
    stock: 8,
    image: "/products/vase.jpg",
    tag: "Studio pick",
    description:
      "A simple sculptural form, beautiful with a single stem or on its own.",
  },
  {
    id: "daily-tote",
    vendorId: "common",
    name: "The daily tote",
    category: "Everyday",
    price: 3200,
    stock: 24,
    image: "/products/tote.jpg",
    tag: "Everyday essential",
    description:
      "An easy carry for market mornings, workdays, and everything between.",
  },
  {
    id: "notebook",
    vendorId: "common",
    name: "Open page notebook",
    category: "Workspace",
    price: 1800,
    stock: 30,
    image: "/products/notebook.jpg",
    tag: "Fresh start",
    description:
      "Space for the next good idea. A simple notebook for daily notes.",
  },
  {
    id: "desk-lamp",
    vendorId: "still",
    name: "Soft light table lamp",
    category: "Workspace",
    price: 8900,
    stock: 6,
    image: "/products/lamp.jpg",
    tag: "For your corner",
    description:
      "A little warmth for your reading corner or a thoughtfully arranged desk.",
  },
  {
    id: "soap",
    vendorId: "still",
    name: "Slow Sunday soap set",
    category: "Home",
    price: 2400,
    stock: 16,
    image: "/products/soap.jpg",
    tag: "Wind down",
    description: "A handmade soap set for a small everyday reset.",
  },
];
export type Product = (typeof products)[number];
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
