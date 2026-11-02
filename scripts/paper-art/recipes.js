// Paper recipes, run inside a headless Chromium page by `scripts/paper-art.mjs`.
//
// A clean SVG shape becomes a torn piece of coloured paper in three layers:
//   1. a soft shadow under it (the piece lifts a hair off the page; the lamp is up and to the left);
//   2. the paper's white core, displaced a little wider than the face, so it shows along the tear in some
//      places and not others — which is what tearing dyed paper actually does;
//   3. the dyed face: torn at two scales (the hand's wander, the fibres' fuzz), with fibre relief and an
//      uneven dye. The crumple is laid on afterwards in canvas (`crumple.js`), as real facets.
// Seeds are explicit, so a regenerated piece tears exactly the way it did before.

/* eslint-disable */
(function () {
  function piece({ shape, w, h, color, rim = '#F7F2E7', seed = 1, tear = 7, rimTear = 11, rimOn = true, fibre = 0.2, mottle = 0.07,
    shadow = 0.24, shadowBlur = 4.5, shadowY = 3.5, pad = 26, edgeFreq = 0.028 }) {
    const W = w + pad * 2, H = h + pad * 2, id = 'p' + seed + '_' + Math.round(Math.random() * 1e9);
    const tearChain = (src, sd, sc, out) => `
      <feTurbulence type="fractalNoise" baseFrequency="${edgeFreq}" numOctaves="3" seed="${sd}" result="${out}n1"/>
      <feDisplacementMap in="${src}" in2="${out}n1" scale="${sc}" xChannelSelector="R" yChannelSelector="G" result="${out}d1"/>
      <feTurbulence type="fractalNoise" baseFrequency="${edgeFreq * 3.4}" numOctaves="2" seed="${sd + 40}" result="${out}n2"/>
      <feDisplacementMap in="${out}d1" in2="${out}n2" scale="${sc * 0.45}" xChannelSelector="R" yChannelSelector="G" result="${out}d2"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${sd + 80}" result="${out}n3"/>
      <feDisplacementMap in="${out}d2" in2="${out}n3" scale="${Math.max(1.2, sc * 0.16)}" xChannelSelector="R" yChannelSelector="G" result="${out}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${-pad} ${-pad} ${W} ${H}">
  <defs>
    <filter id="${id}r" x="${-pad}" y="${-pad}" width="${W}" height="${H}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      ${tearChain('SourceGraphic', seed + 101, rimTear, 'rimS')}
      <feGaussianBlur in="rimS" stdDeviation="0.25" result="rim"/>
      <feGaussianBlur in="rimS" stdDeviation="${shadowBlur}" result="sb"/>
      <feOffset in="sb" dx="${shadowY * 0.45}" dy="${shadowY}" result="so"/>
      <feColorMatrix in="so" type="matrix" values="0 0 0 0 0.09  0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 ${shadow} 0" result="sh"/>
      <feMerge><feMergeNode in="sh"/>${rimOn ? '<feMergeNode in="rim"/>' : ''}</feMerge>
    </filter>
    <filter id="${id}f" x="${-pad}" y="${-pad}" width="${W}" height="${H}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      ${tearChain('SourceGraphic', seed, tear, 'shape')}
      <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="3" seed="${seed + 11}" result="fn"/>
      <feDiffuseLighting in="fn" surfaceScale="1.3" diffuseConstant="1" lighting-color="#fff" result="fl"><feDistantLight azimuth="225" elevation="58"/></feDiffuseLighting>
      <feComponentTransfer in="fl" result="fib"><feFuncR type="linear" slope="${fibre}" intercept="${1 - fibre * 0.8}"/><feFuncG type="linear" slope="${fibre}" intercept="${1 - fibre * 0.8}"/><feFuncB type="linear" slope="${fibre}" intercept="${1 - fibre * 0.8}"/></feComponentTransfer>
      <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="${seed + 31}" result="mn"/>
      <feColorMatrix in="mn" type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1" result="mg"/>
      <feComponentTransfer in="mg" result="mot"><feFuncR type="linear" slope="${mottle * 2}" intercept="${1 - mottle * 1.4}"/><feFuncG type="linear" slope="${mottle * 2}" intercept="${1 - mottle * 1.4}"/><feFuncB type="linear" slope="${mottle * 2}" intercept="${1 - mottle * 1.4}"/><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer>
      <feBlend in="shape" in2="fib" mode="multiply" result="a"/>
      <feBlend in="a" in2="mot" mode="multiply" result="b"/>
      <feComposite in="b" in2="shape" operator="in"/>
    </filter>
  </defs>
  <g filter="url(#${id}r)" fill="${rim}">${shape}</g>
  <g filter="url(#${id}f)" fill="${color}">${shape}</g>
</svg>`;
  }

  /** Renders an SVG string into a canvas at `scale`. */
  function rasterise(svg, scale) {
    return new Promise((resolve, reject) => {
      const m = svg.match(/width="([\d.]+)" height="([\d.]+)"/), w = Math.round(+m[1] * scale), h = Math.round(+m[2] * scale);
      const url = URL.createObjectURL(new Blob([svg.replace(/width="([\d.]+)" height="([\d.]+)"/, `width="${w}" height="${h}"`)], { type: 'image/svg+xml' }));
      const img = new Image();
      img.onload = () => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url); resolve(cv); };
      img.onerror = reject; img.src = url;
    });
  }

  /** Lays crumple facets over whatever is already painted on `cv`, keeping its alpha. */
  function crumpleOver(cv, { meshes, strength = 1, dark = 0.8, light = 0.7, maxA = 0.3, blur = 0.8, seed = 1 }) {
    const L = window.Crumple.field(cv.width, cv.height, meshes);
    const sh = window.Crumple.toShade(L, cv.width, cv.height, { dark: dark * strength, light: light * strength, maxA, blur, seed });
    const g = cv.getContext('2d'); g.globalCompositeOperation = 'source-atop'; g.drawImage(sh, 0, 0); g.globalCompositeOperation = 'source-over';
    return cv;
  }

  window.PaperArt = { piece, rasterise, crumpleOver };
})();
