// DOM Elements
const markdownInput = document.getElementById('markdownInput');
const cssInput = document.getElementById('cssInput');
const documentContainer = document.querySelector('.documentContainer');
const userStylesTag = document.getElementById('user-styles');
const saveButton = document.getElementById('saveButton');
const loadButton = document.getElementById('loadButton');
const fileInput = document.getElementById('fileInput');
const pageNumberInput = document.getElementById('currentPage');
const totalPagesInput = document.getElementById('totalPages');
const goToPageBtn = document.getElementById('goToPageBtn');
const previewPanel = document.querySelector('.previewPanel');

const textToPreviewBtn = document.getElementById('textToPreview');
const previewToTextBtn = document.getElementById('previewToText');


// Tab Buttons
const tabMd = document.getElementById('tab-md');
const tabCss = document.getElementById('tab-css');

// Current Page
let currentPage = 1;
pageNumberInput.value = currentPage;

let pageDataArray = []; // Stores the raw text of each page
const visiblePages = new Set(); // Stores indices of currently visible pages

// SET UP EXTENDED TABLES FOR MARKED.JS
const extendedTables = window["extended-tables"];
marked.use(extendedTables());

// --- 1. DEFAULT DATA ---
const DEFAULT_TEXT = `# Homebrewery HTML
This is a simplified and lightweight webpage
based on NaturalCrit's Homebrewery, accessible
[here](https://github.com/naturalcrit/homebrewery).

\\column

## Running Locally?
Press the Load button in the lower right corner
and select the 'example.txt' file included with this 
to see this project in action.`;
const DEFAULT_CSS = `/* Custom Theme Styles */
.pageContent h1 {
  color: #58180d;
  font-family: 'Times New Roman', serif;
  border-bottom: 2px solid #c9ad6a;
  margin-top: 0;
}`;

(async () => {
  try {
    if (location.protocol === 'file:') {
      markdownInput.value = DEFAULT_TEXT;
      cssInput.value = DEFAULT_CSS;
      updatePreview();
      updateCustomCSS();
      updateMaxPageNumber();
      return;
    }

    const res = await fetch('example.txt');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    const file = new File([text], 'example.txt', { type: 'text/plain' });
    await loadCombinedFile(file)

    markdownInput.value = markdownContent;
    cssInput.value = cssContent;
    
    updatePreview();
    updateCustomCSS();
    updateMaxPageNumber();
  } catch (error) {
    markdownInput.value = DEFAULT_TEXT;
    cssInput.value = DEFAULT_CSS;
  }
})();

// --- SAVE FUNCTION ---
const DELIM = '\n-----DELIMITER_MARKDOWN_CSS-----\n';
let markdownContent = '';
let cssContent = '';
const setMarkdown = v => { markdownContent = v };
const setCSS = v => { cssContent = v };

function saveCombined(filename = 'content.txt') {
  // Ensure markdown & css are strings and preserve exact content
  const md = String(markdownInput.value);
  const css = String(cssInput.value);
  const blob = new Blob([md, DELIM, css], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function loadCombinedFile(file) {
  return new Promise((resolve, reject) => {
    if (!(file instanceof File)) return reject(new TypeError('Argument must be a File'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = () => {
      const text = String(reader.result || '');
      const idx = text.indexOf(DELIM);
      if (idx === -1) {
        // If delimiter not found, assume whole file is markdown and css is empty
        setMarkdown(text);
        setCSS('');
        return resolve({ markdown: text, css: '' });
      }
      const md = text.slice(0, idx);
      const css = text.slice(idx + DELIM.length);
      setMarkdown(md);
      setCSS(css);
      resolve({ markdown: md, css: css });
    };
    reader.readAsText(file, 'utf-8');
  });
}

saveButton.addEventListener('click', () => {
    saveCombined('markdown_and_css.txt');
});

// --- LOAD FUNCTION ---
loadButton.addEventListener('click', () => {
  fileInput.value = '';
  fileInput.click();
});

fileInput.addEventListener('change', async () => {
  const f = fileInput.files && fileInput.files[0];
  if (!f) return;
  try {
    await loadCombinedFile(f);
    markdownInput.value = markdownContent;
    cssInput.value = cssContent;
    
    updatePreview();
    updateCustomCSS();
    updateMaxPageNumber();

  } catch (err) {
    console.error(err);
    alert(err.message || 'Error loading file');
  }
});

// --- CUSTOM CLASSES HELPER ---
function processCustomSyntax(text, currentPageNum) {

    // Matches colons (:) on new lines and replaces them with breaks
    let processed = text.replace(/^\s*:\s*$/gm, '<br>');

    // Matches: {{pageNumber auto}}, {{pageNumber auto - 2}}, or {{pageNumber 5}}
    processed = processed.replace(/\{\{pageNumber\s+([a-zA-Z0-9\-\s]+)\}\}/g, (match, target) => {
        // Clean up whitespace and lower-case the input
        const cleanTarget = target.trim().toLowerCase();
        let pageNum;

        if (cleanTarget.startsWith('auto')) {
            // Check if there is a subtraction modifier, e.g., "auto - 2"
            const matchOffset = cleanTarget.match(/auto\s*-\s*(\d+)/);
            if (matchOffset) {
                const offset = parseInt(matchOffset[1], 10);
                pageNum = currentPageNum - offset;
            } else {
                pageNum = currentPageNum;
            }
        } else {
            pageNum = target.trim();
        }

        return `<div class="pageNumber">${pageNum}</div>`;
    });

    // Matches: {{className[optional spaces][newline or return] content [newline or return]}}
    processed = processed.replace(/\{\{([a-zA-Z0-9\-_]+)\s*\r?\n([\s\S]*?)\r?\n\}\}/g, (match, className, content) => {
        const parsedContent = marked.parse(content);
        return `<div class="${className}">${parsedContent}</div>`;
    });
 
    // The [^\r\n] ensures it will NEVER match if there is a line break inside the braces.
    processed = processed.replace(
      /\{\{([a-zA-Z0-9\-_]+)\s+([\s\S]*?)\}\}/g,
      (_, className, content) => {
        const parsed = marked.parseInline
          ? marked.parseInline(content.trim())
          : marked.parse(content.trim()).replace(/^<p>/,'').replace(/<\/p>$/,'');
        return `<div class="${className}">${parsed}</div>`;
      }
    );

    // This matches text followed by a single set of curly braces containing CSS
    processed = processed.replace(/^([^\n]+)\s*\{([^}]+)\}/gm, (match, textContent, cssRules) => {
        const parsedText = marked.parse(textContent).replace(/^<p>|<\/p>$/g, '');
        return `<div style="${cssRules.trim()}">${parsedText}</div>`;
    });
 
    processed = processed.replace(/\\column/g, '<div class="column-break"></div>');
 
    return processed;
}

// --- 2. THE RENDERING ENGINE ---
function updatePreview() {
    const rawMarkdown = markdownInput.value;
    pageDataArray = rawMarkdown.split('\\page');

    while (documentContainer.children.length > pageDataArray.length) {
        documentContainer.lastChild.remove();
    }
    
    pageDataArray.forEach((pageContent, index) => {
        let pageSection = documentContainer.children[index];
        
        if (!pageSection) {
            // Create shell only if it doesn't exist
            pageSection = document.createElement('section');
            pageSection.className = 'page';
            pageSection.dataset.index = index;
            pageSection.innerHTML = '<div class="pageContent"></div>';
            documentContainer.appendChild(pageSection);
        }
        
        pageSection.id = `page-${index + 1}`;

        // Only update text if the page is visible (managed by your observer)
        if (visiblePages.has(index)) {
            renderPageContent(index, pageSection.firstChild);
        }
    });

    if (typeof updateMaxPageNumber === 'function') {
        updateMaxPageNumber();
    }
}

function renderPageContent(index, containerElement) {
    // const pageContent = pageDataArray[index];
    // const currentPageNum = index + 1;
    
    // const processedHTML = processCustomSyntax(pageContent, currentPageNum);
    // containerElement.innerHTML = marked.parse(processedHTML);

    const nextHTML = marked.parse(processCustomSyntax(pageDataArray[index], index + 1));
    
    // CRITICAL: Only touch the DOM if the markdown actually changed. 
    // This removes 100% of the keystroke flashing!
    if (containerElement.innerHTML !== nextHTML) {
        containerElement.innerHTML = nextHTML;
    }
}

// PRINTING EVENTS
// 1. Prepare EVERYTHING for the printer
window.addEventListener('beforeprint', () => {
    // Loop through all pages and force-render them
    pageDataArray.forEach((pageContent, index) => {
        const pageSection = document.getElementById(`page-${index + 1}`);
        if (pageSection) {
            const pageInner = pageSection.querySelector('.pageContent');
            
            // Only render if it's currently empty
            if (!visiblePages.has(index)) {
                renderPageContent(index, pageInner);
            }
        }
    });
});

// 2. Clean up after printing is done to restore performance
window.addEventListener('afterprint', () => {
    // Run through the current DOM and evict pages that aren't actually in the viewport
    const pageSections = documentContainer.querySelectorAll('.page');
    
    pageSections.forEach(pageSection => {
        const index = parseInt(pageSection.dataset.index);
        const pageInner = pageSection.querySelector('.pageContent');
        
        // If the Intersection Observer says it shouldn't be visible, wipe it
        if (!visiblePages.has(index)) {
            pageInner.innerHTML = '';
        }
    });
});

// --- 3. LIVE CSS INJECTION ---
function updateCustomCSS() {
    // Take the raw string from the CSS box and drop it straight into the <style> tag
    userStylesTag.textContent = cssInput.value;
}

// --- 4. TAB UI TOGGLING ---
tabMd.addEventListener('click', () => {
    tabMd.classList.add('active');
    tabCss.classList.remove('active');
    markdownInput.classList.remove('hidden');
    cssInput.classList.add('hidden');
});

tabCss.addEventListener('click', () => {
    tabCss.classList.add('active');
    tabMd.classList.remove('active');
    cssInput.classList.remove('hidden');
    markdownInput.classList.add('hidden');
});

goToPageBtn.addEventListener('click', () => {
  scrollToPage()
});

pageNumberInput.addEventListener('keydown', (e) => {
  if (e.key !== "Enter") return;

  scrollToPage()
});

function scrollToPage() {
  const currentPageNumberToScrollTo = pageNumberInput.value;
  let page = document.getElementById(`page-${currentPageNumberToScrollTo}`);

  if (!page) return;

  page.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
}

// ARROW BUTTONS

function stripMarkdown(text) {
  return text
    .replace(/[#*`_~]/g, '')        
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') 
    .trim();
}

// --- BUTTON 1: Textarea ➔ Preview ---
textToPreviewBtn.addEventListener('click', () => {
  const text = markdownInput.value;
  const lines = text.split('\n');
  
  // 1. Find the current line index in the textarea viewport
  const lineHeight = parseFloat(getComputedStyle(markdownInput).lineHeight);
  const currentLineIndex = Math.floor(markdownInput.scrollTop / lineHeight);

  // 2. Figure out which PAGE this line belongs to
  let pageCount = 1;
  for (let i = 0; i < currentLineIndex; i++) {
      if (lines[i] && lines[i].includes('\\page')) {
          pageCount++;
      }
  }

  // 3. Find the target page shell container (which always exists in the DOM)
  const targetPageShell = document.getElementById(`page-${pageCount}`);
  
  if (targetPageShell) {
      // 4. Scroll to it. The Intersection Observer will handle the actual rendering mid-scroll!
      targetPageShell.scrollIntoView({ behavior: 'smooth' });
  }
});

// --- BUTTON 2: Preview ➔ Textarea ---
previewToTextBtn.addEventListener('click', () => {
  const currentPageContainer = document.querySelector(`#page-${currentPage} .pageContent`);
  const elements = currentPageContainer.querySelectorAll('*');

  let topElement = null;
  let targetText = '';
  const currentScroll = documentContainer.scrollTop;
  let fallbackContainer = null;


  for (let el of elements) {
    if (el.offsetTop >= currentScroll - 5) {

      const isContainer = el.tagName === 'DIV' && el.children.length > 0;
      if (isContainer) {
        if (!fallbackContainer) fallbackContainer = el; 
        continue; 
      }

      topElement = el;
      break;
    }
  }

  if (!topElement && fallbackContainer) {
    // Grab the very first paragraph, span, or heading inside that container
    topElement = fallbackContainer.querySelector('p, span, h1, h2, h3, h4, li');
  }

  if (topElement) {
    targetText = topElement.textContent.trim().substring(0, 30);
    console.log('target text: ' + targetText);
  }

  // 3. Find the character index of that text in the raw textarea string
  const textContent = markdownInput.value;
  const charIndex = textContent.indexOf(targetText);

  console.log('charindex: '+charIndex);

  if (charIndex !== -1) {
    // 4. Calculate how many lines down that character index is
    const textBefore = textContent.substring(0, charIndex);
    const lineNum = textBefore.split('\n').length - 1;
    
    // 5. Scroll the textarea to that line
    const lineHeight = parseInt(getComputedStyle(markdownInput).lineHeight) || 20;
    markdownInput.scrollTo({
      top: lineNum * lineHeight,
      behavior: 'smooth'
    });
  } 
});

// --- 5. INITIALIZATION ---
markdownInput.addEventListener('input', updatePreview);
cssInput.addEventListener('input', updateCustomCSS); // Watch the CSS box for typing

// --- SAVE FUNCTION OVERWRITE ---
window.addEventListener('keydown', (e) => {
  const isSave = (e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey);
  if (!isSave) return;
  e.preventDefault();
  saveCombined('markdown_and_css.txt');
});

// Pressing tab to add 4 spaces in cssInput
cssInput.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
            e.preventDefault();

            if (!document.execCommand("insertText", false, "    ")) {
                const start = this.selectionStart;
                const end = this.selectionEnd;
                const value = this.value;

                this.value = value.substring(0, start) + "    " + value.substring(end);

                this.selectionStart = this.selectionEnd = start + 4;
            }
        }
    });

// OBSERVER FOR CURRENT PAGE
// Checks which page is currently in view and sets the global currentPageNum variable

const container = document.querySelector('.previewPanel');

function initObserver() {
  const pages = container.querySelectorAll('section[id^="page-"]');

  updateMaxPageNumber();
  pageNumberInput.min = 1;
  pages.forEach(p => {
    observer.observe(p);
    virtualRenderObserver.observe(p);
  });
}

const mo = new MutationObserver((mutations) => {
  mutations.forEach(m => {
    m.addedNodes.forEach(node => {
      if (node.nodeType === 1 && node.matches && node.matches('section[id^="page-"]')) {
        observer.observe(node);
        virtualRenderObserver.observe(node);
      }
    });
  });
});
mo.observe(container, { childList: true, subtree: true });

const intersectOptions = {
  root: document.querySelector(".previewPanel"),
  rootMargin: "0px",
  threshold: 0.5,
};

const intersectCallback = (entries, observer) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
      const elem = entry.target;
      
      const match = elem.id.match(/^page-(\d+)$/);
      if (!match) return;
      changePageNumber(Number(match[1]));
    }
  });
};

const observer = new IntersectionObserver(intersectCallback, intersectOptions);

// VIRTUAL RENDERING OBSERVER
const renderOptions = {
  root: document.querySelector(".previewPanel"),
  rootMargin: "400px 0px", // Pre-renders pages 400px before they hit the screen
  threshold: 0.01,
};

const renderCallback = (entries) => {
  entries.forEach((entry) => {
    // We grab the 0-based index we stored in dataset.index when creating the shell
    const index = parseInt(entry.target.dataset.index);
    const pageInner = entry.target.querySelector('.pageContent');
    if (!pageInner) return;

    if (entry.isIntersecting) {
      if (!visiblePages.has(index)) {
        visiblePages.add(index);
        renderPageContent(index, pageInner); // Call your marked.parse logic here
      }
    } else {
      if (visiblePages.has(index)) {
        visiblePages.delete(index);
        pageInner.innerHTML = ''; // Evict off-screen DOM content
      }
    }
  });
};
const virtualRenderObserver = new IntersectionObserver(renderCallback, renderOptions);

// observe each page
document.addEventListener('DOMContentLoaded', () => {
  initObserver();
});

function changePageNumber(pageNumber) {
  currentPage = pageNumber;
  pageNumberInput.value = currentPage;
}

function updateMaxPageNumber () {
  const pages = container.querySelectorAll('section[id^="page-"]');
  totalPagesInput.value = pages.length;
  pageNumberInput.max = pages.length;

  if (totalPagesInput.value < pageNumberInput) {
    pageNumberInput.value = currentPage;
  }
}

updatePreview();
updateCustomCSS(); // Run it once at the start so default styles apply
