// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// A small gazetteer for the globe and the ask box: city names (English, and Bangla where people will type them)
// with approximate centres. It is for finding a place on the map only; it carries no data and no claim.

export interface City {
  name: string;
  bn?: string;
  country: string;
  lat: number;
  lon: number;
  /** 1 = labelled on the whole globe (a spread-out set); 2 = labelled when zoomed in. */
  tier: 1 | 2;
}

export const CITIES: City[] = [
  // Bangladesh: the division cities
  { name: 'Dhaka', bn: 'ঢাকা', country: 'Bangladesh', lat: 23.81, lon: 90.41, tier: 1 },
  { name: 'Chattogram', bn: 'চট্টগ্রাম', country: 'Bangladesh', lat: 22.36, lon: 91.78, tier: 2 },
  { name: 'Chittagong', bn: 'চট্টগ্রাম', country: 'Bangladesh', lat: 22.36, lon: 91.78, tier: 2 },
  { name: 'Khulna', bn: 'খুলনা', country: 'Bangladesh', lat: 22.85, lon: 89.56, tier: 2 },
  { name: 'Rajshahi', bn: 'রাজশাহী', country: 'Bangladesh', lat: 24.37, lon: 88.6, tier: 2 },
  { name: 'Sylhet', bn: 'সিলেট', country: 'Bangladesh', lat: 24.9, lon: 91.87, tier: 2 },
  { name: 'Rangpur', bn: 'রংপুর', country: 'Bangladesh', lat: 25.75, lon: 89.25, tier: 2 },
  { name: 'Barishal', bn: 'বরিশাল', country: 'Bangladesh', lat: 22.7, lon: 90.37, tier: 2 },
  { name: 'Mymensingh', bn: 'ময়মনসিংহ', country: 'Bangladesh', lat: 24.75, lon: 90.4, tier: 2 },
  { name: "Cox's Bazar", bn: 'কক্সবাজার', country: 'Bangladesh', lat: 21.43, lon: 92.01, tier: 2 },
  // South Asia
  { name: 'Kolkata', bn: 'কলকাতা', country: 'India', lat: 22.57, lon: 88.36, tier: 2 },
  { name: 'Delhi', bn: 'দিল্লি', country: 'India', lat: 28.61, lon: 77.21, tier: 1 },
  { name: 'Mumbai', bn: 'মুম্বাই', country: 'India', lat: 19.08, lon: 72.88, tier: 1 },
  { name: 'Chennai', country: 'India', lat: 13.08, lon: 80.27, tier: 2 },
  { name: 'Bengaluru', country: 'India', lat: 12.97, lon: 77.59, tier: 2 },
  { name: 'Guwahati', country: 'India', lat: 26.14, lon: 91.74, tier: 2 },
  { name: 'Patna', country: 'India', lat: 25.59, lon: 85.14, tier: 2 },
  { name: 'Karachi', country: 'Pakistan', lat: 24.86, lon: 67.0, tier: 2 },
  { name: 'Lahore', country: 'Pakistan', lat: 31.55, lon: 74.34, tier: 2 },
  { name: 'Kathmandu', bn: 'কাঠমান্ডু', country: 'Nepal', lat: 27.72, lon: 85.32, tier: 2 },
  { name: 'Thimphu', country: 'Bhutan', lat: 27.47, lon: 89.64, tier: 2 },
  { name: 'Colombo', country: 'Sri Lanka', lat: 6.93, lon: 79.86, tier: 2 },
  { name: 'Kabul', country: 'Afghanistan', lat: 34.53, lon: 69.17, tier: 2 },
  // East and South-East Asia
  { name: 'Yangon', country: 'Myanmar', lat: 16.84, lon: 96.17, tier: 2 },
  { name: 'Bangkok', country: 'Thailand', lat: 13.76, lon: 100.5, tier: 1 },
  { name: 'Hanoi', country: 'Vietnam', lat: 21.03, lon: 105.85, tier: 2 },
  { name: 'Ho Chi Minh City', country: 'Vietnam', lat: 10.82, lon: 106.63, tier: 2 },
  { name: 'Kuala Lumpur', country: 'Malaysia', lat: 3.14, lon: 101.69, tier: 2 },
  { name: 'Singapore', country: 'Singapore', lat: 1.35, lon: 103.82, tier: 2 },
  { name: 'Jakarta', country: 'Indonesia', lat: -6.2, lon: 106.85, tier: 1 },
  { name: 'Manila', country: 'Philippines', lat: 14.6, lon: 120.98, tier: 2 },
  { name: 'Beijing', country: 'China', lat: 39.9, lon: 116.4, tier: 1 },
  { name: 'Shanghai', country: 'China', lat: 31.23, lon: 121.47, tier: 2 },
  { name: 'Guangzhou', country: 'China', lat: 23.13, lon: 113.26, tier: 2 },
  { name: 'Chengdu', country: 'China', lat: 30.57, lon: 104.07, tier: 2 },
  { name: 'Lhasa', country: 'China', lat: 29.65, lon: 91.17, tier: 2 },
  { name: 'Hong Kong', country: 'China', lat: 22.32, lon: 114.17, tier: 2 },
  { name: 'Taipei', country: 'Taiwan', lat: 25.03, lon: 121.57, tier: 2 },
  { name: 'Seoul', country: 'South Korea', lat: 37.57, lon: 126.98, tier: 2 },
  { name: 'Tokyo', country: 'Japan', lat: 35.68, lon: 139.69, tier: 1 },
  { name: 'Osaka', country: 'Japan', lat: 34.69, lon: 135.5, tier: 2 },
  { name: 'Ulaanbaatar', country: 'Mongolia', lat: 47.89, lon: 106.91, tier: 1 },
  // Central and West Asia, Middle East
  { name: 'Tashkent', country: 'Uzbekistan', lat: 41.3, lon: 69.24, tier: 2 },
  { name: 'Almaty', country: 'Kazakhstan', lat: 43.24, lon: 76.89, tier: 2 },
  { name: 'Tehran', country: 'Iran', lat: 35.69, lon: 51.39, tier: 1 },
  { name: 'Baghdad', country: 'Iraq', lat: 33.31, lon: 44.36, tier: 2 },
  { name: 'Riyadh', country: 'Saudi Arabia', lat: 24.71, lon: 46.68, tier: 2 },
  { name: 'Dubai', country: 'United Arab Emirates', lat: 25.2, lon: 55.27, tier: 2 },
  { name: 'Doha', country: 'Qatar', lat: 25.29, lon: 51.53, tier: 2 },
  { name: 'Istanbul', country: 'Turkey', lat: 41.01, lon: 28.98, tier: 1 },
  { name: 'Ankara', country: 'Turkey', lat: 39.93, lon: 32.86, tier: 2 },
  { name: 'Jerusalem', country: 'Israel', lat: 31.77, lon: 35.21, tier: 2 },
  { name: 'Amman', country: 'Jordan', lat: 31.95, lon: 35.93, tier: 2 },
  // Russia and Europe
  { name: 'Moscow', country: 'Russia', lat: 55.76, lon: 37.62, tier: 1 },
  { name: 'Saint Petersburg', country: 'Russia', lat: 59.93, lon: 30.36, tier: 2 },
  { name: 'Novosibirsk', country: 'Russia', lat: 55.01, lon: 82.93, tier: 2 },
  { name: 'Yakutsk', country: 'Russia', lat: 62.03, lon: 129.73, tier: 2 },
  { name: 'Kyiv', country: 'Ukraine', lat: 50.45, lon: 30.52, tier: 2 },
  { name: 'Warsaw', country: 'Poland', lat: 52.23, lon: 21.01, tier: 2 },
  { name: 'Berlin', country: 'Germany', lat: 52.52, lon: 13.4, tier: 2 },
  { name: 'Paris', country: 'France', lat: 48.86, lon: 2.35, tier: 2 },
  { name: 'London', country: 'United Kingdom', lat: 51.51, lon: -0.13, tier: 1 },
  { name: 'Madrid', country: 'Spain', lat: 40.42, lon: -3.7, tier: 2 },
  { name: 'Lisbon', country: 'Portugal', lat: 38.72, lon: -9.14, tier: 2 },
  { name: 'Rome', country: 'Italy', lat: 41.9, lon: 12.5, tier: 2 },
  { name: 'Athens', country: 'Greece', lat: 37.98, lon: 23.73, tier: 2 },
  { name: 'Vienna', country: 'Austria', lat: 48.21, lon: 16.37, tier: 2 },
  { name: 'Stockholm', country: 'Sweden', lat: 59.33, lon: 18.07, tier: 2 },
  { name: 'Oslo', country: 'Norway', lat: 59.91, lon: 10.75, tier: 2 },
  { name: 'Helsinki', country: 'Finland', lat: 60.17, lon: 24.94, tier: 2 },
  { name: 'Reykjavik', country: 'Iceland', lat: 64.15, lon: -21.94, tier: 2 },
  { name: 'Amsterdam', country: 'Netherlands', lat: 52.37, lon: 4.9, tier: 2 },
  // Africa
  { name: 'Cairo', country: 'Egypt', lat: 30.04, lon: 31.24, tier: 1 },
  { name: 'Lagos', country: 'Nigeria', lat: 6.52, lon: 3.38, tier: 1 },
  { name: 'Abuja', country: 'Nigeria', lat: 9.08, lon: 7.4, tier: 2 },
  { name: 'Accra', country: 'Ghana', lat: 5.6, lon: -0.19, tier: 2 },
  { name: 'Dakar', country: 'Senegal', lat: 14.72, lon: -17.47, tier: 2 },
  { name: 'Casablanca', country: 'Morocco', lat: 33.57, lon: -7.59, tier: 2 },
  { name: 'Algiers', country: 'Algeria', lat: 36.75, lon: 3.06, tier: 2 },
  { name: 'Khartoum', country: 'Sudan', lat: 15.5, lon: 32.56, tier: 2 },
  { name: 'Addis Ababa', country: 'Ethiopia', lat: 9.03, lon: 38.74, tier: 2 },
  { name: 'Nairobi', country: 'Kenya', lat: -1.29, lon: 36.82, tier: 1 },
  { name: 'Dar es Salaam', country: 'Tanzania', lat: -6.79, lon: 39.21, tier: 2 },
  { name: 'Kinshasa', country: 'Democratic Republic of the Congo', lat: -4.44, lon: 15.27, tier: 1 },
  { name: 'Luanda', country: 'Angola', lat: -8.84, lon: 13.23, tier: 2 },
  { name: 'Johannesburg', country: 'South Africa', lat: -26.2, lon: 28.05, tier: 1 },
  { name: 'Cape Town', country: 'South Africa', lat: -33.92, lon: 18.42, tier: 2 },
  { name: 'Antananarivo', country: 'Madagascar', lat: -18.88, lon: 47.51, tier: 2 },
  // The Americas
  { name: 'New York', country: 'United States of America', lat: 40.71, lon: -74.0, tier: 1 },
  { name: 'Washington', country: 'United States of America', lat: 38.91, lon: -77.04, tier: 2 },
  { name: 'Chicago', country: 'United States of America', lat: 41.88, lon: -87.63, tier: 2 },
  { name: 'Houston', country: 'United States of America', lat: 29.76, lon: -95.37, tier: 2 },
  { name: 'Los Angeles', country: 'United States of America', lat: 34.05, lon: -118.24, tier: 1 },
  { name: 'Anchorage', country: 'United States of America', lat: 61.22, lon: -149.9, tier: 1 },
  { name: 'Toronto', country: 'Canada', lat: 43.65, lon: -79.38, tier: 2 },
  { name: 'Vancouver', country: 'Canada', lat: 49.28, lon: -123.12, tier: 2 },
  { name: 'Mexico City', country: 'Mexico', lat: 19.43, lon: -99.13, tier: 1 },
  { name: 'Havana', country: 'Cuba', lat: 23.11, lon: -82.37, tier: 2 },
  { name: 'Bogotá', country: 'Colombia', lat: 4.71, lon: -74.07, tier: 2 },
  { name: 'Lima', country: 'Peru', lat: -12.05, lon: -77.04, tier: 1 },
  { name: 'Manaus', country: 'Brazil', lat: -3.12, lon: -60.02, tier: 2 },
  { name: 'São Paulo', country: 'Brazil', lat: -23.55, lon: -46.63, tier: 1 },
  { name: 'Rio de Janeiro', country: 'Brazil', lat: -22.91, lon: -43.17, tier: 2 },
  { name: 'Buenos Aires', country: 'Argentina', lat: -34.6, lon: -58.38, tier: 1 },
  { name: 'Santiago', country: 'Chile', lat: -33.45, lon: -70.67, tier: 2 },
  // Oceania
  { name: 'Sydney', country: 'Australia', lat: -33.87, lon: 151.21, tier: 1 },
  { name: 'Perth', country: 'Australia', lat: -31.95, lon: 115.86, tier: 1 },
  { name: 'Darwin', country: 'Australia', lat: -12.46, lon: 130.84, tier: 2 },
  { name: 'Auckland', country: 'New Zealand', lat: -36.85, lon: 174.76, tier: 2 },
  { name: 'Port Moresby', country: 'Papua New Guinea', lat: -9.44, lon: 147.18, tier: 2 },
];

export interface CountryFeature {
  type: 'Feature';
  properties: { name: string; lon: number; lat: number };
  geometry: { type: string; coordinates: unknown };
}
