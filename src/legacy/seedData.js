export const INIT_SUPPLIERS = [
  { id: "s1", name: "PharmaCorp", email: "contact@pharmacorp.com", phone: "01 23 45 67 89", address: "12 rue de la Santé, Paris" },
  { id: "s2", name: "MedLab", email: "info@medlab.fr", phone: "01 98 76 54 32", address: "5 avenue Pasteur, Lyon" },
  { id: "s3", name: "GenPharma", email: "ventes@genpharma.com", phone: "04 11 22 33 44", address: "8 bd Médical, Marseille" },
];

export const INIT_DEPOTS = [
  { id: "d1", name: "Dépôt A", location: "Bâtiment Principal", supplierId: "s1" },
  { id: "d2", name: "Dépôt B", location: "Annexe Nord", supplierId: "s2" },
  { id: "d3", name: "Dépôt C", location: "Entrepôt Sud", supplierId: "s1" },
];

export const INIT_PRODUCTS = [
  { id: "p1", name: "Amoxicilline 500mg", price: 1200,  unit: "Boîte", supplierId: "s1" },
  { id: "p2", name: "Paracétamol 1g",     price: 800,   unit: "Boîte", supplierId: "s2" },
  { id: "p3", name: "Ibuprofène 400mg",   price: 950,   unit: "Boîte", supplierId: "s1" },
  { id: "p4", name: "Oméprazole 20mg",    price: 1500,  unit: "Boîte", supplierId: "s3" },
  { id: "p5", name: "Metformine 850mg",   price: 1100,  unit: "Boîte", supplierId: "s2" },
  { id: "p6", name: "Atorvastatine 20mg", price: 2200,  unit: "Boîte", supplierId: "s1" },
  { id: "p7", name: "Amoxicilline 500mg",  price: 1150,  unit: "Boîte", supplierId: "s2" },
];

export const INIT_USERS = [
  { id: "u1", name: "Admin Principal", email: "admin@pharma.com", role: "admin" },
  { id: "u2", name: "Marie Dupont",    email: "marie@pharma.com", role: "gestionnaire" },
  { id: "u3", name: "Jean Martin",     email: "jean@pharma.com",  role: "magasinier" },
  { id: "u4", name: "Sophie Lambert",  email: "sophie@pharma.com",role: "comptable" },
];
