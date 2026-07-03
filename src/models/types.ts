export type TimeSlot = "morning" | "afternoon" | "evening" | "all_day";

export type Location = {
  name: string;
  latitude: number;
  longitude: number;
};

export type UserProfile = {
  defaultLocation: Location;
  preferredStyleNotes?: string;
};

export type UserSensitivity = {
  coldSensitivity: number;
  heatSensitivity: number;
  rainSensitivity: number;
  windSensitivity: number;
  updatedAt: string;
};

export type WeatherData = {
  date: string;
  locationName: string;
  latitude: number;
  longitude: number;
  morningTemp?: number;
  afternoonTemp?: number;
  eveningTemp?: number;
  minTemp: number;
  maxTemp: number;
  feelsLike?: number;
  humidity?: number;
  windSpeed?: number;
  precipitationChance?: number;
  condition: string;
  uvIndex?: number;
  airQuality?: string;
  source: string;
  targetTime?: string;
  capturedAt: string;
};

export type WeatherSnapshot = WeatherData & {
  id: number;
};

export type WeatherContext = {
  timeSlot: TimeSlot;
  temp?: number;
  minTemp?: number;
  maxTemp?: number;
  feelsLike?: number;
  humidity?: number;
  windSpeed?: number;
  precipitationChance?: number;
  condition: string;
  source: string;
  capturedAt: string;
};

export type OutfitFields = {
  tops?: string[];
  bottoms?: string[];
  outerwear?: string[];
  fullBody?: string[];
  innerwear?: string[];
  shoes?: string[];
  accessories?: string[];
};

export type OutfitLog = OutfitFields & {
  id: number;
  date: string;
  timeSlot: TimeSlot;
  locationName: string;
  latitude: number;
  longitude: number;
  feedbackText?: string;
  comfortScore?: number;
  feltCold: boolean;
  feltHot: boolean;
  weatherSnapshotId?: number;
  weatherContext?: WeatherContext;
  createdAt: string;
  updatedAt: string;
  weather?: WeatherSnapshot | null;
};

export type RecommendationData = OutfitFields & {
  reasons: string[];
  riskAlerts: string[];
  coldStart: boolean;
};

export type OutfitRecommendation = {
  id: number;
  targetDate: string;
  locationName: string;
  latitude: number;
  longitude: number;
  recommendationData: RecommendationData;
  basedOnLogIds: number[];
  weatherSnapshotId?: number;
  createdAt: string;
};

export type SimilarLog = {
  log: OutfitLog;
  weather: WeatherSnapshot;
  similarityScore: number;
};
