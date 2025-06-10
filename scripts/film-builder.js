import fs from "fs";
import path from "path";
import { minify } from "html-minifier";
import { promisify } from "util";
import { imageData, index } from "../src/content/film/film.js";

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const copyFile = promisify(fs.copyFile);
const readdir = promisify(fs.readdir);

const siteName = "fi.lm.k&auml;ch";

// Ensure dist directory exists
const ensureDir = async (dir) => {
  if (!fs.existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
};

const copyDir = async (src, dest) => {
  await ensureDir(dest);

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
};

async function scanImageFolder(folderPath) {
  try {
    if (!fs.existsSync(folderPath)) {
      console.log(`Image folder does not exist: ${folderPath}`);
      return [];
    }

    const entries = await readdir(folderPath, { withFileTypes: true });
    const imageFiles = entries
      .filter((entry) => {
        if (!entry.isFile()) return false;
        const ext = path.extname(entry.name).toLowerCase();
        return [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"].includes(ext);
      })
      .map((entry) => entry.name)
      .sort((a, b) => {
        // Natural sort for filenames with numbers
        return a.localeCompare(b, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      });
    console.log(`Found ${imageFiles.length} images in ${folderPath}`);
    return imageFiles;
  } catch (error) {
    console.error(`Error scanning image folder ${folderPath}:`, error);
    return [];
  }
}

async function findContentFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return findContentFiles(fullPath); // recurse
      } else if (entry.name.endsWith("-content.html")) {
        return fullPath;
      }
      return null;
    })
  );
  return files.flat().filter(Boolean);
}

async function buildPage(file) {
  const pageName = path.basename(file, "-content.html");
  const relative = path.dirname(
    path.relative("./src/content", path.resolve(file))
  );
  console.log(`Building ${pageName}.html...`);

  // Read template files
  const baseTemplate = await readFile("./src/templates/base.html", "utf8");
  const header = await readFile("./src/templates/header-film.html", "utf8");
  const footer = await readFile("./src/templates/footer.html", "utf8");

  // Read page-specific content
  const contentFile = `./src/content/${relative}/${pageName}-content.html`;
  let pageContent = await readFile(contentFile, "utf8");

  // Assemble the page
  let finalHTML = baseTemplate
    .replace(
      "{{PAGE_TITLE}}",
      pageName === "index" ? siteName : `${siteName} - ${pageName}`
    )
    .replace('<div id="header-container"></div>', header)
    .replace('<div id="content-container"></div>', pageContent)
    .replace('<div id="footer-container"></div>', footer);

  finalHTML = minify(finalHTML, {
    removeComments: true,
    collapseWhitespace: true,
    conservativeCollapse: true,
    minifyJS: true,
    minifyCSS: true,
  });
  await ensureDir(`./dist/${relative}`);
  await writeFile(`./dist/${relative}/${pageName}.html`, finalHTML);
}

// Build film gallery pages
export async function buildFilmPages() {
  console.log("Building film pages...");

  // Read base template and other templates
  const baseTemplate = await readFile("./src/templates/base.html", "utf8");
  const header = await readFile("./src/templates/header-film.html", "utf8");
  const footer = await readFile("./src/templates/footer.html", "utf8");

  await copyDir("./dist/static/img/font", "./dist/static/img/film/font");

  for (const [collectionName, images] of Object.entries(imageData)) {
    console.log(`Building film collection: ${collectionName}...`);
    var imgs = images;
    if (images.length === 0) {
      imgs = await scanImageFolder(`./src/static/img/film/${collectionName}`);
    }
    const collectionContent = `
      <section class="horizontal-gallery">
      <div class="horizontal-scroll-container">
          ${imgs
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
    const contentFiles = await findContentFiles("./src/content/film");
    for (const file of contentFiles) {
      await buildPage(file);
    }
    await writeFile(`./dist/film/${collectionName}.html`, collectionHTML);
    if (collectionName === index) {
      await writeFile(`./dist/film/index.html`, collectionHTML);
    }
  }
}
