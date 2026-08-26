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
import bmstu from "./bmstu/adapter";
import mgimo from "./mgimo/adapter";
import pirogov from "./pirogov/adapter";
import sechenov from "./sechenov/adapter";
import gubkin from "./gubkin/adapter";
import msal from "./msal/adapter";
import muctr from "./muctr/adapter";
import rsuh from "./rsuh/adapter";
import fa from "./fa/adapter";
import mospolytech from "./mospolytech/adapter";

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
  bmstu,
  mgimo,
  pirogov,
  sechenov,
  gubkin,
  msal,
  muctr,
  rsuh,
  fa,
  mospolytech,
];
export const getUniversityAdapter = (slug: string) =>
  universityAdapters.find((adapter) => adapter.slug === slug);
