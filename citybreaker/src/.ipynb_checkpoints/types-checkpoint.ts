// Global types for CityBreaker app

/**
 * RichWelcomeData
 * Represents the detailed welcome card content returned by the /api/travel-tips endpoint.
 */
export interface RichWelcomeData {
  /** A single, captivating welcome sentence that sets the scene. */
  intro: string;

  /** Array of single-word strings describing the city's atmosphere. */
  vibeKeywords: string[];

  /** A short description of one iconic, can't‑miss activity. */
  mustDo: string;

  /** A description of a lesser-known spot or experience offering a unique local perspective. */
  hiddenGem: string;

  /** A recommendation for a specific local dish, drink, or food market to try. */
  foodieTip: string;
}
