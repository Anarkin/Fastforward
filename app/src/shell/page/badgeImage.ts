const badgeSize = 16;

const inks = ['fill', 'stroke', 'color'] as const;

export async function badgeImageOf(
  icon: SVGSVGElement,
  ground: string,
): Promise<string | undefined> {
  const copy = icon.cloneNode(true);
  if (!(copy instanceof Element)) {
    return undefined;
  }
  const parts = [icon, ...icon.querySelectorAll('*')];
  [copy, ...copy.querySelectorAll('*')].forEach((part, index) => {
    const style = getComputedStyle(parts[index]);
    for (const ink of inks) {
      part.setAttribute(ink, style.getPropertyValue(ink));
    }
  });
  copy.setAttribute('width', String(badgeSize));
  copy.setAttribute('height', String(badgeSize));
  const image = new Image();
  image.src = `data:image/svg+xml,${encodeURIComponent(
    new XMLSerializer().serializeToString(copy),
  )}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = badgeSize;
  canvas.height = badgeSize;
  const context = canvas.getContext('2d');
  if (context === null) {
    return undefined;
  }
  context.fillStyle = ground;
  context.beginPath();
  context.roundRect(0, 0, badgeSize, badgeSize, badgeSize / 5);
  context.fill();
  context.drawImage(image, 0, 0, badgeSize, badgeSize);
  return canvas.toDataURL('image/png');
}
