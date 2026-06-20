import fieldBase from '../assets/field-base.png';

/**
 * The oval. Renders the club-standard AFL ground artwork (bundled PNG, so it
 * can't 404 and exports cleanly with the rest of the graphic). It's purely
 * scenery — player plates are positioned over the top by TeamSheet using the
 * percentage coordinates in lib/field.ts, which are mapped to this image's
 * green playing surface.
 *
 * To re-skin the ground (e.g. a club's home-ground photo), swap this one file.
 */
export default function Oval() {
  return <img className="sw1-oval-img" src={fieldBase} alt="Australian Rules football oval" />;
}
