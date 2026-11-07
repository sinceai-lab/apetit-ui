// Id and code patterns shared by every route validator.
export const RX = {
  farmId: /^[FS]\d{4}$/,
  cellId: /^[A-Z]{2}\d{4}$/,
  parcelId: /^[FS]\d{4}-P\d{1,4}$/,
  entityId: /^urn:ngsi-ld:(Farm|Parcel|ClimateGridCell|WeatherObserved|YieldPrediction|LoadLog|Catchment):[A-Za-z0-9_.:-]{1,128}$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  month: /^\d{4}-(0[1-9]|1[0-2])$/,
  crop: /^[a-z_]{2,32}$/,
  year: /^\d{4}$/,
};
