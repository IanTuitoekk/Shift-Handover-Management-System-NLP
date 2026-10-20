/*
 * Photography used in the app. All images come from Wikimedia Commons under free licences that
 * require attribution (shown on the /credits page). They were cropped and compressed for the web;
 * share-alike licences carry over to these adapted versions. Chosen for having no legible airline
 * branding. Do not add Kenya Airways logos or livery here.
 */
import loginRunwayLights from './login-runway-lights.jpg';
import groundHangarCrew from './ground-hangar-crew.jpg';
import supervisorHangarFloor from './supervisor-hangar-floor.jpg';
import categoryEquipment from './category-equipment.jpg';
import categoryProcedural from './category-procedural.jpg';
import categoryGroundEvent from './category-ground-event.jpg';

export const PHOTOS = {
  login: {
    src: loginRunwayLights,
    width: 900,
    height: 460,
    alt: '',
    credit: 'login',
  },
  groundHome: {
    src: groundHangarCrew,
    width: 1600,
    height: 560,
    alt: '',
    credit: 'groundHome',
  },
  supervisorHome: {
    src: supervisorHangarFloor,
    width: 1600,
    height: 560,
    alt: '',
    credit: 'supervisorHome',
  },
  'aircraft equipment problem': {
    src: categoryEquipment,
    width: 720,
    height: 480,
    alt: '',
    credit: 'equipment',
  },
  'deviation/discrepancy - procedural': {
    src: categoryProcedural,
    width: 720,
    height: 423,
    alt: '',
    credit: 'procedural',
  },
  'other/rare ground event': {
    src: categoryGroundEvent,
    width: 720,
    height: 524,
    alt: '',
    credit: 'groundEvent',
  },
};

export function categoryPhoto(categoryName) {
  return categoryName ? PHOTOS[categoryName.toLowerCase()] ?? null : null;
}

export const PHOTO_CREDITS = [
  {
    key: 'login',
    use: 'Login and register (cropped to the runway lights)',
    title: 'Runway lights',
    author: 'US Air Force',
    license: 'Public domain',
    licenseUrl: 'https://commons.wikimedia.org/wiki/File:Runway_lights_(16304931130).jpg',
    source: 'https://commons.wikimedia.org/wiki/File:Runway_lights_(16304931130).jpg',
  },
  {
    key: 'groundHome',
    use: 'Ground crew home',
    title: 'Seattle South CC aircraft maintenance 04',
    author: 'Joe Mabel',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Seattle_South_CC_aircraft_maintenance_04.jpg',
  },
  {
    key: 'supervisorHome',
    use: 'Supervisor overview',
    title: 'Seattle South CC aircraft maintenance 03',
    author: 'Joe Mabel',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Seattle_South_CC_aircraft_maintenance_03.jpg',
  },
  {
    key: 'equipment',
    use: 'Equipment reports',
    title: 'Landing gear repair',
    author: 'Tigerlily242',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Landing_gear_repair.jpg',
  },
  {
    key: 'procedural',
    use: 'Procedural reports',
    title: 'Checklist',
    author: 'NATO E-3A Component',
    license: 'CC BY 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Checklist_(8557618276).jpg',
  },
  {
    key: 'groundEvent',
    use: 'Ground event reports (cropped)',
    title: 'Flughafen Erfurt, aircraft tug',
    author: 'Ralf Roletschek',
    license: 'Free Art License',
    licenseUrl: 'https://artlibre.org/licence/lal/en/',
    source: 'https://commons.wikimedia.org/wiki/File:2011-05-18-flughafen-erfurt-by-RalfR-14.jpg',
  },
];
