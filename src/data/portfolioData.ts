/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** A real client photo in the 3D look gallery. Only the name and photo: no invented details. */
export interface LookArchiveItem {
  id: string;
  title: string;
  coverImage: string;
}

/** A real client photo in the "Our Signature Looks" lookbook. */
export interface RunwayLookItem {
  id: string;
  lookNum: string;
  title: string;
  image: string;
}

/**
 * One bookable service from a price list. `bookingName(service)` is what gets saved with a booking, so the
 * booking window's options (src/data/bookingServices.ts) are built from these lists.
 */
export interface ServiceItem {
  id: string;
  title: string;
  /** Set for the senior artist's price list; Deepika's own services leave it out. */
  artist?: 'senior';
  /** bridal = the three bridal packages; family = non-bridal family glam and the groom package;
   *  single = makeup, hair or saree draping on its own */
  category: 'bridal' | 'family' | 'single';
  /** US dollars */
  price: number;
  /** The price is for each person (confirmed by Deepika for the non-bridal look) */
  perPerson?: boolean;
  /** e.g. "Most Recommended" */
  badge?: string;
  /** Who it is for, shown under the title */
  forWhom?: string;
  /** The ✔ lines from the price list */
  features: string[];
  idealFor?: string;
  /** Card photo (2:3, faces in the top third). Deepika's packages only: the photos show her own work. */
  image?: string;
}

export const BUSINESS_INFO = {
  name: "Deepika Makeup & Hair",
  artist: "Deepika S",
  title: "Atlanta Luxury Makeup Artist & Educator",
  tagline: "Luxury Bridal Makeup & Hair · Family Glam · Groom Makeovers · Makeup Classes",
  location: "Atlanta, GA, USA",
  serviceArea: "Package prices are for Atlanta. Deepika also travels: travel charges are additional (based on location), and accommodation is arranged by the client",
  instagram: "https://www.instagram.com/deepikamakeupandhair/",
  instagramHandle: "@deepikamakeupandhair",
  // Two lines, both on WhatsApp and for calls; the US number is the main one.
  // Display text, tel: target (international format, no spaces) and country for each number.
  phonePrimary: "+1 980-497-7720",
  phonePrimaryTel: "+19804977720",
  phonePrimaryCountry: "USA",
  phoneSecondary: "+91 91135 85961",
  phoneSecondaryTel: "+919113585961",
  phoneSecondaryCountry: "India",
  // WhatsApp links need the full international number (country code, no +)
  whatsappUrl: "https://wa.me/19804977720",
  whatsappSecondaryUrl: "https://wa.me/919113585961",
  // The AI assistant's own WhatsApp number (Twilio). The website's WhatsApp buttons open a chat with it; Deepika's
  // numbers above stay for calls and for when the assistant passes a customer to her personally.
  assistantWhatsapp: "+1 938-946-4851",
  assistantWhatsappUrl: "https://wa.me/19389464851",
  // The public website (the assistants share links to its pages, e.g. the price list)
  website: "https://www.deepikamakeupandhair.com",
  // Bridal inquiries by email land here (the /bridal-inquiry page and every "Email" button open a pre-written mail to it)
  email: "workwithdeepikamakeupandhair@gmail.com",
  certification: "Certification valid in 180 countries",
  bio: "Deepika S is an Atlanta-based makeup artist with 15+ years of expertise in the beauty industry, 6000+ bridal transformations and 8000+ non-bridal clients. She is known for creating timeless, luxury bridal looks that are personally curated to make every bride feel flawless, radiant and unforgettable. Every bridal package is designed to match the event (wedding, engagement, Pellikuthuru and other wedding events), the bride's skin type and her dream vision. Her non-bridal looks for the bride's family and wedding guests are customized to age, skin type, outfit and role in the celebration. She also teaches makeup classes.",
};

/** From Deepika's price list. */
export const EXPERIENCE_STATS = [
  { value: '15+', label: 'Years in the beauty industry' },
  { value: '6000+', label: 'Bridal transformations' },
  { value: '8000+', label: 'Non-bridal clients' },
];

/** Both WhatsApp / phone lines, US first. Every place that offers WhatsApp lists these. */
export const WHATSAPP_CONTACTS = [
  {
    country: BUSINESS_INFO.phonePrimaryCountry,
    number: BUSINESS_INFO.phonePrimary,
    tel: BUSINESS_INFO.phonePrimaryTel,
    url: BUSINESS_INFO.whatsappUrl,
  },
  {
    country: BUSINESS_INFO.phoneSecondaryCountry,
    number: BUSINESS_INFO.phoneSecondary,
    tel: BUSINESS_INFO.phoneSecondaryTel,
    url: BUSINESS_INFO.whatsappSecondaryUrl,
  },
];

// 12 real client photos for the 3D look gallery
export const ARCHIVE_LOOKS: LookArchiveItem[] = [
  { id: "south-indian-muhurtham", title: "Royal Muhurtham", coverImage: "/images/portfolio/archive-royal-muhurtham.jpg" },
  { id: "reception-starlight", title: "Starlight Reception", coverImage: "/images/portfolio/archive-starlight-reception.jpg" },
  { id: "ivory-heritage-bride", title: "Luminous Ivory Bride", coverImage: "/images/portfolio/archive-luminous-ivory-bride.jpg" },
  { id: "sangeet-floral-braid", title: "Sangeet Euphoria", coverImage: "/images/portfolio/archive-sangeet-euphoria.jpg" },
  { id: "glass-skin-cocktail", title: "Dewy Glass Cocktail", coverImage: "/images/portfolio/archive-dewy-glass-cocktail.jpg" },
  { id: "masterclass-atelier", title: "Education Atelier", coverImage: "/images/portfolio/archive-education-atelier.jpg" },
  { id: "transformation-glow", title: "The Signature Metamorphosis", coverImage: "/images/portfolio/archive-signature-metamorphosis.jpg" },
  { id: "artist-studio-signature", title: "Deepika's Atlanta Studio", coverImage: "/images/portfolio/archive-atlanta-studio.jpg" },
  { id: "velvet-mehendi", title: "Golden Hour Mehendi", coverImage: "/images/portfolio/archive-golden-hour-mehendi.jpg" },
  { id: "classic-heritage-crimson", title: "Heritage Crimson", coverImage: "/images/portfolio/archive-heritage-crimson.jpg" },
  { id: "emerald-regency-glam", title: "Emerald Regency", coverImage: "/images/portfolio/archive-emerald-regency.jpg" },
  { id: "editorial-runway-glow", title: "Editorial Silk", coverImage: "/images/portfolio/archive-editorial-silk.jpg" },
];

// 6 real client photos for the "Our Signature Looks" lookbook
export const RUNWAY_LOOKS: RunwayLookItem[] = [
  { id: "runway-look-1", lookNum: "01", title: "The Royal Muhurtham", image: "/images/portfolio/runway-01-royal-muhurtham.jpg" },
  { id: "runway-look-2", lookNum: "02", title: "The Starlight Reception", image: "/images/portfolio/runway-02-starlight-reception.jpg" },
  { id: "runway-look-3", lookNum: "03", title: "The Luminous Ivory Veil", image: "/images/portfolio/runway-03-luminous-ivory-veil.jpg" },
  { id: "runway-look-4", lookNum: "04", title: "Sangeet Radiant Euphoria", image: "/images/portfolio/runway-04-sangeet-euphoria.jpg" },
  { id: "runway-look-5", lookNum: "05", title: "Modern Glass Skin Cocktail", image: "/images/portfolio/runway-05-glass-skin-cocktail.jpg" },
  { id: "runway-look-6", lookNum: "06", title: "Bridal Transformation Master", image: "/images/portfolio/runway-06-bridal-transformation.jpg" },
];

/*
 * Deepika's price list (bridal package for inside Atlanta, and the non-bridal package). Only what is written there
 * belongs here: no durations or extra services.
 */
export const SERVICES: ServiceItem[] = [
  {
    id: "hd-bridal",
    title: "HD Bridal Makeup",
    category: "bridal",
    price: 550,
    image: "/images/portfolio/svc-bridal.jpg",
    features: [
      "Matte & polished finish",
      "Fuller coverage for acne, pigmentation & texture",
      "Heavier, more defined bridal glam",
      "Long-lasting flawless finish",
    ],
    idealFor: "Brides who prefer a classic, fuller coverage bridal look",
  },
  {
    id: "advanced-bridal",
    title: "Advanced Bridal Makeup",
    category: "bridal",
    price: 600,
    image: "/images/portfolio/svc-reception.jpg",
    features: [
      "Glossy, elevated luxury finish",
      "More radiant & refined glam",
      "Perfect for reception, evening, and night events",
      "Balanced coverage with enhanced glow",
    ],
    idealFor: "Brides who want a glamorous, polished finish",
  },
  {
    id: "airbrush-bridal",
    title: "Airbrush Bridal Makeup",
    category: "bridal",
    price: 650,
    badge: "Most Recommended",
    image: "/images/portfolio/svc-photoshoot.jpg",
    features: [
      "Premium natural, skin-like finish",
      "Lightweight & luxurious feel",
      "Sweat-proof, water-resistant & humidity-friendly",
      "Seamless, radiant, long-lasting bridal glow",
    ],
    idealFor: "Brides who want a soft, flawless, celebrity-style transformation",
  },
  {
    id: "non-bridal-family-glam",
    title: "Non-Bridal (Family Glam)",
    category: "family",
    price: 300,
    perPerson: true,
    image: "/images/portfolio/svc-party.jpg",
    forWhom: "For cousins, bridesmaids, family members, aunts, wedding guests & mothers",
    features: [
      "Soft glam / polished luxury finish",
      "Makeup customized to outfit & event",
      "Beautiful event-ready glam",
      "One hairstyling",
      "One saree draping",
      "Designed to create an elegant, radiant, camera-ready look",
    ],
    idealFor: "Bridesmaids, sisters, cousins & close family",
  },
  {
    id: "groom-makeover",
    title: "Groom Makeover Package",
    category: "family",
    price: 250,
    // The only real photo with a groom in it (bride and groom by the lake)
    image: "/images/portfolio/svc-engagement.jpg",
    features: [
      "Sweat-proof natural finish makeup",
      "Hair setting",
      "Groom styling assistance",
      "Skin-like polished groom look",
    ],
  },
  { id: "only-makeup", title: "Only Makeup", category: "single", price: 200, features: [] },
  { id: "only-hair", title: "Only Hair", category: "single", price: 180, features: [] },
  { id: "only-saree-draping", title: "Only Saree Draping", category: "single", price: 70, features: [] },
];

/*
 * The senior artist's price list (the "BRIDAL (SENIOR ARTIST)" sheet), copied as written: it has no separate
 * charges and no "not included" list for non-bridal. No card photos: the site's photos show Deepika's own work.
 */
export const SENIOR_ARTIST_SERVICES: ServiceItem[] = [
  {
    id: "senior-hd-bridal",
    title: "HD Bridal Makeup",
    artist: "senior",
    category: "bridal",
    price: 500,
    features: [
      "Matte & polished finish",
      "Fuller coverage for acne, pigmentation & texture",
      "Heavier, more defined bridal glam",
      "One hairstyling + one saree draping",
    ],
    idealFor: "Brides who prefer a classic, fuller coverage bridal look",
  },
  {
    id: "senior-advanced-bridal",
    title: "Advanced Bridal Makeup",
    artist: "senior",
    category: "bridal",
    price: 550,
    features: [
      "Glossy, elevated luxury finish",
      "More radiant & refined glam",
      "Perfect for reception, evening, and night events",
      "Balanced coverage with enhanced glow",
      "One hairstyling + one saree draping",
    ],
    idealFor: "Brides who want a glamorous, polished finish",
  },
  {
    id: "senior-airbrush-bridal",
    title: "Airbrush Bridal Makeup",
    artist: "senior",
    category: "bridal",
    price: 600,
    badge: "Most Recommended",
    features: [
      "Premium natural, skin-like finish",
      "Lightweight & luxurious feel",
      "Sweat-proof, water-resistant & humidity-friendly",
      "Seamless, radiant, long-lasting bridal glow",
      "One hairstyling + one saree draping",
    ],
    idealFor: "Brides who want a soft, flawless, celebrity-style transformation",
  },
  {
    id: "senior-non-bridal-family-glam",
    title: "Non-Bridal",
    artist: "senior",
    category: "family",
    price: 300,
    perPerson: true,
    forWhom: "For cousins, mothers, aunts, bridesmaids, family members & wedding guests",
    features: [
      "Soft glam / polished luxury finish",
      "Makeup customized to outfit & event",
      "Beautiful event-ready glam",
      "One hairstyling",
      "One saree draping",
      "Designed to create an elegant, radiant, camera-ready look",
    ],
    idealFor: "Bridesmaids, sisters, guests, cousins & family members",
  },
  {
    id: "senior-groom-makeover",
    title: "Groom Makeover Package",
    artist: "senior",
    category: "family",
    price: 250,
    features: [
      "Sweat-proof natural finish makeup",
      "Hair setting",
      "Groom styling assistance",
      "Skin-like polished groom look",
    ],
  },
];

/** The name saved with a booking: senior artist services say so, e.g. "HD Bridal Makeup (Senior Artist)". */
export const bookingName = (s: ServiceItem) => (s.artist === 'senior' ? `${s.title} (Senior Artist)` : s.title);

/** Photo on the "Separate Charges" card (Only Makeup / Only Hair / Only Saree Draping) */
export const SEPARATE_CHARGES_IMAGE = "/images/portfolio/svc-birthday.jpg";

/** "$650" */
export const formatPrice = (usd: number) => `$${usd}`;

/** "$650", or "$300 per person" for a per-person price */
export const formatServicePrice = (s: Pick<ServiceItem, 'price' | 'perPerson'>) =>
  `${formatPrice(s.price)}${s.perPerson ? ' per person' : ''}`;

/** A price Deepika quotes on WhatsApp for an occasion other than a wedding (not on the prices page). */
export interface OccasionPrice {
  title: string;
  price: number;
  perPerson?: boolean;
  /** What comes with it, e.g. "One hairstyle" */
  includes?: string[];
  /** Saved with a booking request, e.g. "Party HD Makeup + Hair" */
  bookingName: string;
}

/** Deepika's quote for these occasions (18 Nov 2026), with Deepika herself. */
export const FUNCTION_OCCASIONS = ["Engagement", "House Warming", "Half Saree Function"];
export const FUNCTION_PRICES: OccasionPrice[] = [
  {
    title: "HD Makeup",
    price: 500,
    includes: [
      "Matte & polished finish",
      "Fuller coverage for acne, pigmentation & texture",
      "Long-lasting flawless finish",
      "One hairstyle",
      "One saree draping",
    ],
    bookingName: "HD Makeup (Engagement / House Warming / Half Saree Function)",
  },
];

/** Deepika's quote for birthday parties and other parties (18 Nov 2026): per person, with Deepika herself. */
export const PARTY_PRICES: OccasionPrice[] = [
  { title: "Basic Makeup + Hair", price: 350, perPerson: true, bookingName: "Party Basic Makeup + Hair" },
  { title: "HD Makeup + Hair", price: 450, perPerson: true, bookingName: "Party HD Makeup + Hair" },
  { title: "Advanced Makeup + Hair", price: 500, perPerson: true, bookingName: "Party Advanced Makeup + Hair" },
];

/** What comes with every bridal package (HD, Advanced and Airbrush), from the price list. */
export const BRIDAL_PACKAGE = {
  events: "wedding, engagement, Pellikuthuru and other wedding events",
  includes: ["One complete bridal makeup", "One hairstyle", "One saree draping", "Premium lashes included"],
  experience: [
    "Dedicated bridal styling guidance",
    "Outfit, jewelry & accessory coordination",
    "Jewelry setting assistance",
    "Pre-bridal skincare consultation",
    "Glow-enhancing skincare & diet guidance",
    "Personalized recommendations based on your bridal vision",
  ],
  notIncluded: ["Hair extensions", "Accessories", "Contact lenses"],
  recommendation:
    "For the most flawless, radiant, natural, and luxurious bridal finish, Airbrush Bridal Makeup is highly recommended for brides who want the ultimate premium experience with maximum longevity and comfort.",
};

/** Not part of the non-bridal (family glam) package or the separate charges. */
export const NON_BRIDAL_NOT_INCLUDED = ["Lashes", "Hair extensions", "Accessories"];

export const TRAVEL_POLICY = [
  "Travel charges additional (based on location)",
  "Accommodation to be arranged by client (if required)",
];

/** The advance that secures a date: this percentage of the total package amount (19 Nov 2026), non-refundable. */
export const ADVANCE_PERCENT = 25;

export const BOOKING_POLICY = [
  "Non-refundable advance required to secure your date",
  "Booking amount is non-transferable",
  "Date is confirmed only after advance payment",
  "Postponement / cancellation charges may apply",
];

/** The two price lists, as the prices page (/prices) switches between them. */
export interface PriceTier {
  id: 'deepika' | 'senior';
  label: string;
  services: ServiceItem[];
  /** Shown next to the bridal packages heading */
  bridalNote?: string;
  /** Only Deepika's sheet lists what non-bridal looks leave out */
  nonBridalNotIncluded?: string[];
}

export const PRICE_TIERS: PriceTier[] = [
  { id: 'deepika', label: 'With Deepika', services: SERVICES, bridalNote: 'Inside Atlanta', nonBridalNotIncluded: NON_BRIDAL_NOT_INCLUDED },
  { id: 'senior', label: 'With a Senior Artist', services: SENIOR_ARTIST_SERVICES },
];

// Real client video reviews. Quotes are only the lines heard clearly in each video (checked with two speech
// models); names are left off until their spelling is confirmed.
export interface VideoTestimonial {
  id: string;
  video: string;
  poster: string;
  /** Which look the bride is talking about, shown under the quote */
  event: string;
  quote: string;
  /** Describes the video for screen readers */
  description: string;
}

export const VIDEO_TESTIMONIALS: VideoTestimonial[] = [
  {
    id: "reception-bride",
    video: "/images/portfolio/testimonial-red-saree-bride.mp4",
    poster: "/images/portfolio/testimonial-red-saree-bride-poster.jpg",
    event: "Reception look",
    quote: "I just loved it. I love your work. I've been searching for you since December.",
    description: "Video review from a bride in a red silk saree and gold temple jewellery, talking about her reception look"
  },
  {
    id: "wedding-bride",
    video: "/images/portfolio/testimonial-lakeside-bride.mp4",
    poster: "/images/portfolio/testimonial-lakeside-bride-poster.jpg",
    event: "Wedding look",
    quote: "It's amazing, thank you so much! … I'm looking so beautiful.",
    description: "Video review from a bride in a peach and gold saree with emerald jewellery, talking about her wedding look by a lake"
  }
];

// Instagram strip (slow auto-scroll). Order is interleaved so similar colors and the same bride
// never sit side by side.
export const INSTAGRAM_HIGHLIGHTS: { id: string; image: string; caption: string; tag: string }[] = [
  { id: "ig-1", image: "/images/portfolio/ig-01-temple-light.jpg", tag: "Traditional Bridal",
    caption: "Timeless South Indian bride bathed in morning temple light. Fresh jasmine & temple jewelry." },
  { id: "ig-lavender-silk", image: "/images/portfolio/ig-lavender-silk.jpg", tag: "Traditional Bridal",
    caption: "Lavender silk and layered temple gold for a serene bridal morning." },
  { id: "ig-tangerine-drape", image: "/images/portfolio/ig-tangerine-drape.jpg", tag: "Bridal Couture",
    caption: "Tangerine silk against a vintage green drape, finished with soft glam." },
  { id: "ig-4", image: "/images/portfolio/ig-04-sangeet-braid.jpg", tag: "Sangeet Hair",
    caption: "Sangeet nights require a braid that can dance until dawn! Pearl & blossom pin details." },
  { id: "ig-lakeside-couple", image: "/images/portfolio/ig-lakeside-couple.jpg", tag: "Couple Portraits",
    caption: "Lakeside portraits with the groom, in soft blush silk." },
  { id: "ig-sage-arches", image: "/images/portfolio/ig-sage-arches.jpg", tag: "Traditional Bridal",
    caption: "Sage and gold silk framed by palace arches." },
  { id: "ig-2", image: "/images/portfolio/ig-02-emerald-waves.jpg", tag: "Reception Glam",
    caption: "Hollywood waves & emerald tones for our stunning Atlanta reception bride. 💚" },
  { id: "ig-classic-red", image: "/images/portfolio/ig-classic-red.jpg", tag: "Traditional Bridal",
    caption: "Classic red bridal silk with a warm, radiant finish." },
  { id: "ig-jasmine-jada", image: "/images/portfolio/ig-jasmine-jada.jpg", tag: "Bridal Hair",
    caption: "A full jasmine jada, pinned for the walk to the mandap." },
  { id: "ig-sapphire-gown", image: "/images/portfolio/ig-sapphire-gown.jpg", tag: "Portraits",
    caption: "A sapphire gown, side-swept curls and luminous evening glam." },
  { id: "ig-plum-silk", image: "/images/portfolio/ig-plum-silk.jpg", tag: "Traditional Bridal",
    caption: "Plum silk saree with layered heirloom gold." },
  { id: "ig-3", image: "/images/portfolio/ig-03-champagne-shimmer.jpg", tag: "Bridal Couture",
    caption: "The magic of subtle champagne shimmer and weightless skin. Booking 2026/2027 brides." },
  { id: "ig-tangerine-full-length", image: "/images/portfolio/ig-tangerine-full-length.jpg", tag: "Editorial",
    caption: "Styled head to toe in tangerine silk and temple jewelry." },
  { id: "ig-bride-and-pup", image: "/images/portfolio/ig-bride-and-pup.jpg", tag: "Candid Moments",
    caption: "The bride and her best boy, just before the ceremony." },
  { id: "ig-ivory-gold", image: "/images/portfolio/ig-ivory-gold.jpg", tag: "Traditional Bridal",
    caption: "Ivory and gold silk with a bold red border and temple gold." },
  { id: "ig-5", image: "/images/portfolio/ig-05-natural-radiance.jpg", tag: "Transformation",
    caption: "Skin that looks like skin. No caking, no heavy mask—just pure natural radiance elevated." },
  { id: "ig-mustard-silk", image: "/images/portfolio/ig-mustard-silk.jpg", tag: "Bridal Couture",
    caption: "Mustard silk and a sculpted, glowing complexion." },
  { id: "ig-ceremony-navy", image: "/images/portfolio/ig-ceremony-navy.jpg", tag: "Ceremony",
    caption: "Navy and marigold silk, ceremony-ready among the rituals." },
  { id: "ig-golden-couple", image: "/images/portfolio/ig-golden-couple.jpg", tag: "Couple Portraits",
    caption: "A quiet moment with the groom in red and gold." },
  { id: "ig-violet-silk", image: "/images/portfolio/ig-violet-silk.jpg", tag: "Bridal Couture",
    caption: "Violet silk saree and soft, defined eyes." },
  { id: "ig-amber-arches", image: "/images/portfolio/ig-amber-arches.jpg", tag: "Traditional Bridal",
    caption: "Amber and gold silk beneath palace arches." },
  { id: "ig-6", image: "/images/portfolio/ig-06-jada-technique.jpg", tag: "Education",
    caption: "Jasmine jada with gold billai, pinned strand by strand — a technique taught in our pro hair mentorship." },
  { id: "ig-ruby-emerald", image: "/images/portfolio/ig-ruby-emerald.jpg", tag: "Bridal Couture",
    caption: "Ruby and emerald silk with statement bridal jewelry." },
  { id: "ig-mint-chaise", image: "/images/portfolio/ig-mint-chaise.jpg", tag: "Editorial",
    caption: "Mint silk on a vintage chaise, styled like an old portrait." },
  { id: "ig-ceremony-rituals", image: "/images/portfolio/ig-ceremony-rituals.jpg", tag: "Ceremony",
    caption: "Family hands, the kalash and fresh mehendi: ceremony-ready." },
  { id: "ig-coral-silk", image: "/images/portfolio/ig-coral-silk.jpg", tag: "Traditional Bridal",
    caption: "Coral silk and warm temple gold." },
  { id: "ig-marigold-mandap", image: "/images/portfolio/ig-marigold-mandap.jpg", tag: "Ceremony",
    caption: "Seated before a wall of marigolds for the ceremony." },
  { id: "ig-gold-silk", image: "/images/portfolio/ig-gold-silk.jpg", tag: "Bridal Couture",
    caption: "Gold silk and a luminous, camera-ready finish." },
  { id: "ig-plum-heirloom", image: "/images/portfolio/ig-plum-heirloom.jpg", tag: "Traditional Bridal",
    caption: "Plum silk against carved doors and heirloom gold." },
  { id: "ig-wine-silk", image: "/images/portfolio/ig-wine-silk.jpg", tag: "Traditional Bridal",
    caption: "Wine and emerald silk with layered temple necklaces." },
  { id: "ig-window-light", image: "/images/portfolio/ig-window-light.jpg", tag: "Portraits",
    caption: "A soft, glowing look in gentle window light." },
  { id: "ig-carved-doors-couple", image: "/images/portfolio/ig-carved-doors-couple.jpg", tag: "Couple Portraits",
    caption: "Newlyweds framed by carved temple doors." },
];
