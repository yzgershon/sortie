# Sortie custom artwork

## Current set (IAF jets, 2026-09-26)

Yish asked for the best front-line jets and light Israeli Air Force accents. Three images were generated with GPT Image 2 (low quality tier, 2K, 16:9) through the Higgsfield CLI on Yish's free plan, costing 0.5 credits each. One earlier Soul Cinema attempt (0.12 credits) was too dark and cropped and was discarded. Total spent: 1.62 credits. No user records were supplied to the model.

They are generated illustrations of the aircraft types, not photographs of a real aircraft, unit, base or event. Tail numbers and squadron markings were excluded. The small roundels the model painted on the aircraft are part of the depiction of an IAF jet.

| File | Aircraft | Where it appears | Size |
|---|---|---|---|
| `sortie-adir.jpg` | F-35I Adir at blue hour | Home greeting, under today's mission chart | 1600×905, ~71 KB |
| `sortie-sufa.jpg` | Two F-16I Sufa over a fictional desert crater | Course-journey header | 1280×724, ~135 KB |
| `sortie-raam.jpg` | F-15I Ra'am climbing on afterburner | What's New header | 1600×905, ~47 KB |
| `sortie-journal.jpg` | Logbook still life (earlier set) | Instructor report header | unchanged |

The earlier `sortie-horizon.jpg` (generic trainer) and `sortie-terrain.jpg` were retired from the app and the release manifest; they remain in git history. Original PNGs and discarded attempts are in `C:\Dev\artifacts\sortie-redesign\gen`. Resizing and compression were done with Pillow; theme treatment and cropping are in CSS. Essential labels and all report data remain real HTML text.

### adir

Photorealistic wide aviation photograph, production image asset for a mobile app hero. An Israeli Air Force F-35I Adir stealth fighter jet, complete aircraft fully in frame including both wingtips and twin canted tails, seen from a low front three-quarter angle, parked on a desert air base runway at blue hour. The jet sits in the LEFT half of the frame, its nose pointing toward the camera-left. A small subtle blue Star of David roundel on the wing, no readable tail numbers, no text, no people. Runway edge lights receding to a low Negev desert horizon with a thin warm amber glow; the RIGHT half of the frame is calm deep blue open sky with lots of negative space. Accurate F-35 geometry: diamond-shaped wings, chined nose, single engine, twin vertical tails. Restrained steel-blue and charcoal palette, well exposed aircraft with crisp specular highlights on the radar-absorbent skin, premium editorial aviation photography, subtle film grain.

### sufa

Photorealistic wide air-to-air aviation photograph, production image asset for a mobile app. Two Israeli Air Force F-16I Sufa fighter jets flying in close echelon formation over a vast fictional desert erosion crater with layered sandstone ridges and a dry winding riverbed, late golden hour. Both complete aircraft fully in frame, seen from slightly above and behind in a banking turn, placed across the CENTER horizontal band of the image, left of center. Accurate F-16I details: single engine, bubble canopy, dorsal spine, conformal fuel tanks along the fuselage. Small subtle blue Star of David roundels, no readable numbers, no text, no people visible, no weapons. Long soft shadows on the terrain, restrained palette of sandstone, charcoal and steel blue, low saturation, crisp detail, premium editorial aviation photography, subtle film grain.

### raam

Photorealistic wide aviation photograph, production image asset for a mobile app header. A single Israeli Air Force F-15I Ra'am two-seat strike fighter pulling up into a steep climb just after sunset, twin engines in full afterburner with glowing blue-orange shock diamonds, vapour streaming off the wings. Complete aircraft fully in frame, side-on from slightly below, placed in the LEFT-CENTER of the frame. Accurate F-15I details: twin vertical tails, twin engines, large rectangular intakes, two-seat canopy, conformal fuel tanks. Small subtle blue Star of David roundel, no readable numbers, no text, no people visible. Deep indigo dusk sky with a faint last band of warm light low on the horizon, RIGHT side calm open sky. Restrained steel-blue and charcoal palette, crisp detail, premium editorial aviation photography, subtle film grain.

## Course badge (2026-09-26)

`badge.png` is the badge the course uses, supplied by Yish, who asked for it in a prominent place. The supplied image had a checkerboard baked into its pixels. It was cut out along the red ring with a 2.5 px inset and anti-aliased edge, squared, resized to 320×320 and palette-quantized (about 9 KB). No other change was made to the artwork.

It replaces the earlier outline ring-and-star mark in the top bar of every main screen, the sign-in, course and PIN screens, the update message, the course-progress header, the Home avatar when no name is set, and the shared progress image. It is decorative wherever it appears (empty alt), since the app name always stands beside it. The installed app icon is unchanged.

## Earlier set

Created with the built-in image-generation tool on 2026-09-26. Fictional editorial images, not photographs of a specific unit, base, cadet or official course event. Only `sortie-journal.jpg` is still used.

## Earlier prompts

### horizon

Use case: photorealistic-natural. Create an original production image asset for Sortie, a professional mobile Hebrew flight-training journal. Wide landscape 3:2 photograph, no text or UI. Scene: the quiet end of a runway before dawn, one generic unmarked two-seat training jet seen from rear three-quarter view in the LEFT third, parked with canopy closed, subtle runway edge lights receding toward a low distant horizon. Realistic restrained editorial aviation photography with exquisite brushed metal detail, no dramatic combat, no weapons, no people, no military insignia, no flags, no logos, no readable markings. Deep charcoal and slate neutral shadows, a narrow pale warm sunrise at horizon, muted sage and champagne highlights, very low saturation, no bright cyan or neon. Center and RIGHT half mostly uncluttered dark sky/airfield negative space. Frame generous sky and full aircraft with landing gear, no cropped wings. Tactile fine film grain, natural light, sophisticated quiet mood, plausible aeronautical proportions. The composition must crop beautifully to a shallow 3.3:1 mobile masthead with aircraft/horizon in the middle vertical band. This is an actual asset, not a phone mockup, no text, no borders, no watermark.

### journal

Use case: photorealistic-natural. Original production image asset for Sortie, a professional pilot's Hebrew mobile flight journal. Wide landscape 3:2 editorial still-life photograph on a dark graphite desk: a closed black fabric flight logbook with subtle stitched binding, a brushed metal mechanical pencil, an unmarked flight helmet partly visible at far LEFT edge. Objects arranged in LEFT half, center and RIGHT half spacious dark desktop, no lettering anywhere. Intimate low raking window light, restrained matte charcoal, olive sage and warm gray, very low saturation, no cyan, no neon, no readable maps, no insignia or logos. Beautiful authentic material detail: fine paper page edges, woven fabric, machined pencil, subtle scuffs. Calm and orderly, precision and reflection after a flight. Shallow angle, no cartoon, no diagram, no UI, no phone mockup, no text, no watermark. Compose objects near central horizontal band so a shallow 3.3:1 crop still reads, premium restrained photography.

### terrain

Use case: photorealistic-natural. Original production image asset for Sortie, a professional mobile pilot-training journal. Wide landscape 3:2 aerial editorial photograph of a fictional arid ridge landscape from high above at dawn. Elegant layered topography and a winding dry riverbed running diagonally from lower LEFT to center, distant ridges into haze. No buildings, aircraft, roads, coordinates, borders, maps or labels. Not a specific real location. Restrained charcoal shadows, pale sandstone, muted sage-gray and champagne light, very low saturation, exquisite natural terrain detail and quiet spaciousness. RIGHT half calmer dark ridges with negative space. Designed for a mobile course-journey masthead, crop well to shallow 3.3:1 through center. Premium aviation editorial image, no text, no diagrams, no UI, no device mockup, no watermark.
