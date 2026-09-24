// A phone camera photo is several megabytes; what these screens show is a few
// hundred pixels of it. Scaling happens here, on the device, before anything
// is sent — the server stores what it is given, so it has to be given
// something sensible.

// Wide strip, whole image kept (no crop): a venue photograph is a place, and
// cropping it to a square throws away the half that shows what it looks like.
// 1200px covers a 353px strip at 3x.
const MAX_WIDTH = 1200;

export function toWideJpeg(file, maxWidth = MAX_WIDTH, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("לא הצלחנו לקרוא את הקובץ"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("הקובץ הזה אינו תמונה"));
      image.onload = () => {
        const scale = Math.min(1, maxWidth / image.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
