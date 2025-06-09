import fs from "fs";
import path from "path";
import { minify } from "html-minifier";
import { promisify } from "util";
import { imageData, index } from "../src/content/film/film.js";

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

const siteName = "the nest";

// Ensure dist directory exists
const ensureDir = async (dir) => {
  if (!fs.existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
};

// Build film gallery pages
export async function buildFilmPages() {
  console.log("Building film pages...");

  // Read base template and other templates
  const baseTemplate = await readFile("./src/templates/base.html", "utf8");
  const header = await readFile("./src/templates/header-film.html", "utf8");
  const footer = await readFile("./src/templates/footer.html", "utf8");

  for (const [collectionName, images] of Object.entries(imageData)) {
    console.log(`Building film collection: ${collectionName}...`);
    const collectionContent = `
      <section class="horizontal-gallery">
      <div class="horizontal-scroll-container">
          ${images
            .map(
              (imageName) => `
            <div class="horizontal-gallery-item">
              <img src="/static/img/film/${collectionName}/${imageName}" 
                   class="gallery__img" 
                   alt="${imageName.replace(/\.(jpg|jpeg|png)$/i, "")}"
                   loading="lazy">
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `;

    let collectionHTML = baseTemplate
      .replace("{{PAGE_TITLE}}", `${siteName} - ${collectionName}`)
      .replace('<div id="header-container"></div>', header)
      .replace('<div id="content-container"></div>', collectionContent)
      .replace('<div id="footer-container"></div>', footer);

    collectionHTML = minify(collectionHTML, {
      removeComments: true,
      collapseWhitespace: true,
      conservativeCollapse: true,
      minifyJS: true,
      minifyCSS: true,
    });

    await writeFile(`./dist/film/${collectionName}.html`, collectionHTML);
    if (collectionName === index) {
      await writeFile(`./dist/film/index.html`, collectionHTML);
    }
  }
}
