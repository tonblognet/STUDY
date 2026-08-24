import hse from "./hse/adapter";
import mai from "./mai/adapter";
import mipt from "./mipt/adapter";
import misis from "./misis/adapter";
import mpei from "./mpei/adapter";
import mephi from "./mephi/adapter";
import rudn from "./rudn/adapter";
import ranepa from "./ranepa/adapter";
import msu from "./msu/adapter";
import rea from "./rea/adapter";

export const universityAdapters = [
  hse,
  mai,
  mipt,
  misis,
  mpei,
  mephi,
  rudn,
  ranepa,
  msu,
  rea,
];
export const getUniversityAdapter = (slug: string) =>
  universityAdapters.find((adapter) => adapter.slug === slug);
