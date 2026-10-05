import type {HairColor,Outfit} from './state';
export const lookAssets:Record<Outfit,Record<HairColor,string>>={classic:{black:'/art/look-classic-black.webp',brown:'/art/look-classic-brown.webp',white:'/art/look-classic-white.webp'},traveler:{black:'/art/look-traveler-black.webp',brown:'/art/look-traveler-brown.webp',white:'/art/look-traveler-white.webp'},celestial:{black:'/art/look-celestial-black.webp',brown:'/art/look-celestial-brown.webp',white:'/art/look-celestial-white.webp'}};
export const hairNames={black:'مشکی',brown:'قهوه‌ای',white:'سفید'};
export const outfitNames={classic:'کلاسیک',traveler:'سفر و طبیعت',celestial:'روح و ستاره'};

export const diagonalAssets:Record<Outfit,Record<HairColor,string>>={classic:{black:'/art/diag-classic-black.webp',brown:'/art/diag-classic-brown.webp',white:'/art/diag-classic-white.webp'},traveler:{black:'/art/diag-traveler-black.webp',brown:'/art/diag-traveler-brown.webp',white:'/art/diag-traveler-white.webp'},celestial:{black:'/art/diag-celestial-black.webp',brown:'/art/diag-celestial-brown.webp',white:'/art/diag-celestial-white.webp'}};
