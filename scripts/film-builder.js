import fs from "fs";
import path from "path";
import { minify } from "html-minifier";
import { promisify } from "util";
import { findContentFiles, ensureDir, copyStatic } from "../scripts/build.js";

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);

const siteName = "fi.lm.k&auml;ch";

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

async function scanFilmCollections(basePath, relativePath = "") {
  const collections = {};

  try {
    if (!fs.existsSync(basePath)) {
      console.log(`Film base path does not exist: ${basePath}`);
      return collections;
    }

    const entries = await readdir(basePath, { withFileTypes: true });

    // Check if current folder has images
    const currentFolderImages = await scanImageFolder(basePath);
    if (currentFolderImages.length > 0) {
      const collectionName = relativePath || "root";
      collections[collectionName] = currentFolderImages;
      console.log(
        `Found collection: ${collectionName} with ${currentFolderImages.length} images`
      );
    }

    // Recursively scan subdirectories
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subFolderPath = path.join(basePath, entry.name);
        const subRelativePath = relativePath
          ? `${relativePath}/${entry.name}`
          : entry.name;

        const subCollections = await scanFilmCollections(
          subFolderPath,
          subRelativePath
        );
        Object.assign(collections, subCollections);
      }
    }
  } catch (error) {
    console.error(`Error scanning film collections from ${basePath}:`, error);
  }

  return collections;
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

function createImagePairs(images) {
  const pairs = [];
  const imageMap = new Map();

  // Create a map of images by their base name (digit + letter)
  images.forEach((imageName) => {
    const match = imageName.match(/^(\d+)([ab])(.*)/);
    if (match) {
      const [, digit, letter, _] = match;
      if (!imageMap.has(digit)) {
        imageMap.set(digit, {});
      }
      imageMap.get(digit)[letter] = imageName;
    } else {
      imageMap.set(imageName, {});
      imageMap.get(imageName)["a"] = imageName;
    }
  });

  // Create pairs, prioritizing 'a' images and pairing with 'b' when available
  imageMap.forEach((letterMap, digit) => {
    if (letterMap.a) {
      pairs.push({
        primary: letterMap.a,
        hover: letterMap.b || null,
      });
    } else if (letterMap.b) {
      // If only 'b' exists, show it normally without hover effect
      pairs.push({
        primary: letterMap.b,
        hover: null,
      });
    }
  });
  return pairs;
}

// Build film gallery pages
export async function buildFilmPages() {
  console.log("Building film pages...");

  // Read base template and other templates
  const baseTemplate = await readFile("./src/templates/base.html", "utf8");
  const header = await readFile("./src/templates/header-film.html", "utf8");
  const footer = await readFile("./src/templates/footer.html", "utf8");

  await copyStatic(
    "./src/static/img/font",
    "./src/static/img/film/albums/font"
  );

  // Scan for film collections recursively
  const imageData = await scanFilmCollections("./src/static/img/film");

  // Determine index collection (could be first alphabetically, or you can set a specific one)
  const collectionNames = Object.keys(imageData).sort();
  const indexCollection = collectionNames[0]; // Use first collection as index, or modify this logic

  for (const [collectionName, images] of Object.entries(imageData)) {
    console.log(`Building film collection: ${collectionName}...`);

    const imagePairs = createImagePairs(images);
    const collectionContent = `
      <section class="horizontal-gallery">
      <div class="horizontal-scroll-container">
          ${imagePairs
            .map(
              (pair) => `
            <div class="horizontal-gallery-item${
              pair.hover ? " has-hover" : ""
            }">
              <img src="/static/img/film/${collectionName}/${pair.primary}" 
                   class="gallery__img gallery__img--primary" 
                   alt="${pair.primary.replace(/\.(jpg|jpeg|png)$/i, "")}"
                   loading="lazy">
              ${
                pair.hover
                  ? `
              <img src="/static/img/film/${collectionName}/${pair.hover}" 
                   class="gallery__img gallery__img--hover" 
                   alt="${pair.hover.replace(/\.(jpg|jpeg|png)$/i, "")}"
                   loading="lazy">
              `
                  : ""
              }
            </div>
            <script>document.addEventListener('DOMContentLoaded', function() {
  const galleryItems = document.querySelectorAll('.horizontal-gallery-item.has-hover');
  
  galleryItems.forEach(item => {
    let touchStartTime = 0;
    let isScrolling = false;
    let scrollContainer;
    
    // Find the scroll container
    scrollContainer = item.closest('.horizontal-scroll-container');
    
    // Track scrolling state
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', () => {
        isScrolling = true;
        setTimeout(() => {
          isScrolling = false;
        }, 150);
      });
    }
    
    item.addEventListener('touchstart', function(e) {
      touchStartTime = Date.now();
      isScrolling = false;
      
      // Add touch-active class after a short delay to distinguish from scrolling
      setTimeout(() => {
        if (!isScrolling) {
          item.classList.add('touch-active');
        }
      }, 100);
    });
    
    item.addEventListener('touchmove', function(e) {
      // Check if the touch is still over this element
      const touch = e.touches[0];
      const elementFromPoint = document.elementFromPoint(touch.clientX, touch.clientY);
      
      if (!item.contains(elementFromPoint)) {
        item.classList.remove('touch-active');
      }
    });
    
    item.addEventListener('touchend', function(e) {
      const touchDuration = Date.now() - touchStartTime;
      
      // Remove active state after a delay
      setTimeout(() => {
        item.classList.remove('touch-active');
      }, 300);
    });
    
    item.addEventListener('touchcancel', function(e) {
      item.classList.remove('touch-active');
    });
  });
});</script>
          `
            )
            .join("")}
        </div>
      </div>
    `;

    // Set page title based on whether this is the index collection
    let collectionHTML;
    if (collectionName === indexCollection) {
      collectionHTML = baseTemplate.replace("{{PAGE_TITLE}}", `${siteName}`);
    } else {
      collectionHTML = baseTemplate.replace(
        "{{PAGE_TITLE}}",
        `${siteName} - ${collectionName}`
      );
    }

    collectionHTML = collectionHTML
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

    // Build content pages
    const contentFiles = await findContentFiles("./src/content/film");
    for (const file of contentFiles) {
      await buildPage(file);
    }

    // Write collection HTML
    await ensureDir(`./dist/film/${collectionName}`);
    await writeFile(`./dist/film/${collectionName}.html`, collectionHTML);

    // If this is the index collection, also write it as index.html
    if (collectionName === indexCollection) {
      await writeFile(`./dist/film/index.html`, collectionHTML);
    }
  }
}
