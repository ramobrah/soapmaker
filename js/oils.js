/*
 * Oil database.
 *
 * sap  = saponification value, mg KOH per g oil. NaOH is derived: sap * 40.00 / 56.11 / 1000.
 * iod  = iodine value. ins = INS value.
 * fa   = fatty acid % in this order:
 *        [lauric, myristic, palmitic, stearic, ricinoleic, oleic, linoleic, linolenic]
 *        (minor acids such as caprylic, capric, palmitoleic, gadoleic are not tracked,
 *         so rows may not sum to 100).
 *
 * Values are typical figures compiled from common soapmaking references. Natural oils vary
 * by source and batch. Check SAP values against your supplier's certificate of analysis
 * and adjust here or add a custom oil in the app.
 *
 * cat: veg | butter | animal | wax | additive
 */
window.OILS = [
  { id: "olive",          name: "Olive oil",                     cat: "veg",    sap: 190, iod: 85,  ins: 105, fa: [0, 0, 14, 3, 0, 69, 12, 1] },
  { id: "olive-pomace",   name: "Olive oil, pomace",             cat: "veg",    sap: 188, iod: 84,  ins: 104, fa: [0, 0, 14, 3, 0, 69, 12, 2] },
  { id: "coconut-76",     name: "Coconut oil, 76°F",             cat: "veg",    sap: 257, iod: 10,  ins: 258, fa: [48, 19, 9, 3, 0, 8, 2, 0] },
  { id: "babassu",        name: "Babassu oil",                   cat: "veg",    sap: 247, iod: 15,  ins: 230, fa: [50, 20, 11, 4, 0, 10, 0, 0] },
  { id: "palm-kernel",    name: "Palm kernel oil",               cat: "veg",    sap: 247, iod: 20,  ins: 227, fa: [49, 16, 8, 2, 0, 15, 3, 0] },
  { id: "palm",           name: "Palm oil",                      cat: "veg",    sap: 199, iod: 53,  ins: 145, fa: [0, 1, 44, 5, 0, 39, 10, 0] },
  { id: "castor",         name: "Castor oil",                    cat: "veg",    sap: 180, iod: 86,  ins: 95,  fa: [0, 0, 0, 0, 90, 4, 4, 0] },
  { id: "sweet-almond",   name: "Sweet almond oil",              cat: "veg",    sap: 195, iod: 99,  ins: 97,  fa: [0, 0, 7, 0, 0, 71, 18, 0] },
  { id: "apricot-kernel", name: "Apricot kernel oil",            cat: "veg",    sap: 195, iod: 100, ins: 91,  fa: [0, 0, 6, 0, 0, 66, 29, 0] },
  { id: "avocado",        name: "Avocado oil",                   cat: "veg",    sap: 186, iod: 86,  ins: 99,  fa: [0, 0, 20, 2, 0, 58, 12, 0] },
  { id: "argan",          name: "Argan oil",                     cat: "veg",    sap: 191, iod: 95,  ins: 95,  fa: [0, 0, 14, 6, 0, 46, 34, 0] },
  { id: "hazelnut",       name: "Hazelnut oil",                  cat: "veg",    sap: 195, iod: 97,  ins: 94,  fa: [0, 0, 5, 3, 0, 75, 10, 0] },
  { id: "macadamia",      name: "Macadamia nut oil",             cat: "veg",    sap: 195, iod: 76,  ins: 119, fa: [0, 0, 9, 5, 0, 59, 2, 0] },
  { id: "sunflower",      name: "Sunflower oil",                 cat: "veg",    sap: 189, iod: 133, ins: 63,  fa: [0, 0, 7, 4, 0, 16, 70, 1] },
  { id: "sunflower-ho",   name: "Sunflower oil, high oleic",     cat: "veg",    sap: 189, iod: 83,  ins: 106, fa: [0, 0, 3, 4, 0, 83, 4, 0] },
  { id: "safflower-ho",   name: "Safflower oil, high oleic",     cat: "veg",    sap: 192, iod: 93,  ins: 99,  fa: [0, 0, 5, 2, 0, 77, 15, 0] },
  { id: "canola",         name: "Canola oil",                    cat: "veg",    sap: 186, iod: 110, ins: 56,  fa: [0, 0, 4, 2, 0, 61, 21, 9] },
  { id: "soybean",        name: "Soybean oil",                   cat: "veg",    sap: 191, iod: 131, ins: 61,  fa: [0, 0, 11, 5, 0, 24, 50, 8] },
  { id: "rice-bran",      name: "Rice bran oil",                 cat: "veg",    sap: 187, iod: 100, ins: 87,  fa: [0, 1, 22, 3, 0, 38, 34, 2] },
  { id: "grapeseed",      name: "Grapeseed oil",                 cat: "veg",    sap: 181, iod: 131, ins: 66,  fa: [0, 0, 8, 4, 0, 20, 68, 0] },
  { id: "hemp",           name: "Hemp seed oil",                 cat: "veg",    sap: 193, iod: 165, ins: 39,  fa: [0, 0, 6, 2, 0, 12, 57, 21] },
  { id: "sesame",         name: "Sesame oil",                    cat: "veg",    sap: 188, iod: 110, ins: 81,  fa: [0, 0, 10, 5, 0, 40, 43, 0] },
  { id: "peanut",         name: "Peanut oil",                    cat: "veg",    sap: 192, iod: 92,  ins: 99,  fa: [0, 0, 8, 3, 0, 56, 26, 0] },
  { id: "corn",           name: "Corn oil",                      cat: "veg",    sap: 192, iod: 117, ins: 69,  fa: [0, 0, 12, 2, 0, 32, 51, 1] },
  { id: "cottonseed",     name: "Cottonseed oil",                cat: "veg",    sap: 194, iod: 108, ins: 89,  fa: [0, 1, 22, 3, 0, 19, 54, 0] },
  { id: "walnut",         name: "Walnut oil",                    cat: "veg",    sap: 189, iod: 145, ins: 45,  fa: [0, 0, 7, 2, 0, 18, 60, 13] },
  { id: "wheat-germ",     name: "Wheat germ oil",                cat: "veg",    sap: 183, iod: 128, ins: 58,  fa: [0, 0, 17, 2, 0, 17, 58, 0] },
  { id: "neem",           name: "Neem oil",                      cat: "veg",    sap: 199, iod: 72,  ins: 124, fa: [0, 0, 18, 15, 0, 50, 13, 0] },
  { id: "jojoba",         name: "Jojoba oil (liquid wax)",       cat: "wax",    sap: 92,  iod: 83,  ins: 11,  fa: [0, 0, 0, 0, 0, 12, 0, 0] },
  { id: "shea",           name: "Shea butter",                   cat: "butter", sap: 179, iod: 59,  ins: 116, fa: [0, 0, 5, 40, 0, 48, 6, 0] },
  { id: "cocoa",          name: "Cocoa butter",                  cat: "butter", sap: 194, iod: 37,  ins: 157, fa: [0, 0, 28, 33, 0, 35, 3, 0] },
  { id: "mango",          name: "Mango butter",                  cat: "butter", sap: 191, iod: 45,  ins: 146, fa: [0, 0, 7, 42, 0, 45, 3, 0] },
  { id: "kokum",          name: "Kokum butter",                  cat: "butter", sap: 190, iod: 35,  ins: 155, fa: [0, 0, 4, 56, 0, 36, 1, 0] },
  { id: "lard",           name: "Lard (pig tallow)",             cat: "animal", sap: 198, iod: 57,  ins: 139, fa: [0, 1, 28, 13, 0, 46, 6, 0] },
  { id: "tallow-beef",    name: "Tallow, beef",                  cat: "animal", sap: 200, iod: 45,  ins: 147, fa: [2, 6, 28, 22, 0, 36, 3, 1] },
  { id: "chicken-fat",    name: "Chicken fat",                   cat: "animal", sap: 195, iod: 69,  ins: 130, fa: [0, 1, 25, 7, 0, 38, 21, 0] },
  { id: "beeswax",        name: "Beeswax",                       cat: "wax",    sap: 94,  iod: 10,  ins: 84,  fa: [0, 0, 0, 0, 0, 0, 0, 0] },
  { id: "stearic-acid",   name: "Stearic acid (triple pressed)", cat: "additive", sap: 198, iod: 2, ins: 196, fa: [0, 0, 45, 55, 0, 0, 0, 0] }
];

window.FA_NAMES = ["Lauric", "Myristic", "Palmitic", "Stearic", "Ricinoleic", "Oleic", "Linoleic", "Linolenic"];

window.CATEGORIES = {
  veg: "Vegetable oils",
  butter: "Butters",
  animal: "Animal fats",
  wax: "Waxes",
  additive: "Additives",
  custom: "My oils"
};
