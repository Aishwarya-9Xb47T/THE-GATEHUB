import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

const V2_GOLDEN_CORPUS_DIR = path.resolve('v2-golden-corpus');

export async function generateV2GoldenCorpus() {
  if (!fs.existsSync(V2_GOLDEN_CORPUS_DIR)) {
    fs.mkdirSync(V2_GOLDEN_CORPUS_DIR, { recursive: true });
  }

  console.log('[generateV2GoldenCorpus] Generating V2 Golden Test Corpus in:', V2_GOLDEN_CORPUS_DIR);

  // 1. Engineering Research Paper Markdown (Equations, Code, Flowchart, Tables, Questions)
  const mdContent = `# AntiGravity V2 - Advanced Multimodal Neural Systems

Author: DeepMind Agentic Team

## 1. Mathematical Blueprint & Formulas
Maxwell Field Tensor Definition:
$$\\mathbf{F}_{\\mu\\nu} = \\partial_{\\mu} A_{\\nu} - \\partial_{\\nu} A_{\\mu}$$

Relativistic Loss Function:
$$\\mathcal{L}(\\theta) = \\frac{1}{N} \\sum_{i=1}^{N} \\left( y_i \\log(\\hat{y}_i) + (1-y_i) \\log(1-\\hat{y}_i) \\right)$$

## 2. High-Performance C++ Neural Kernel
\`\`\`cpp
#include <iostream>
#include <vector>

template <typename T>
T compute_activation(T input) {
    return (input > 0) ? input : static_cast<T>(0);
}

int main() {
    std::cout << "AntiGravity Kernel Active." << std::endl;
    return 0;
}
\`\`\`

## 3. Distributed Architecture Topology
\`\`\`mermaid
graph TD
    Ingress[API Gateway] -->|gRPC| Parser[Native Parser Engine]
    Parser -->|AST Tree| Reasoner[Question Reasoner Engine]
    Reasoner -->|Graph Edges| DB[(Knowledge Graph Store)]
\`\`\`

## 4. Benchmark Matrix
| Model Architecture | Accuracy (%) | Latency (ms) | Memory (GB) |
| AntiGravity V2 | 100.0 | 8 | 1.2 |
| Legacy V1 Parser | 85.4 | 45 | 3.8 |
| Baseline OCR | 72.1 | 120 | 4.5 |

## 5. Comprehensive Question Suite

Q1: What is the tensor definition of the electromagnetic field tensor?
A) \\partial_{\\mu} A_{\\nu} - \\partial_{\\nu} A_{\\mu}
B) \\nabla \\times \\mathbf{B}
C) \\frac{\\partial E}{\\partial t}
D) 0

Answer: A
Explanation: Extracted from Maxwell Field Tensor Definition in Section 1.

Q2: Which engine architecture achieved 100% accuracy in the benchmark matrix?
A) Legacy V1 Parser
B) AntiGravity V2
C) Baseline OCR
D) Native PDF Parser

Answer: B
[Notes]: AntiGravity V2 demonstrated 100.0% accuracy with 8ms execution latency.
`;

  fs.writeFileSync(path.join(V2_GOLDEN_CORPUS_DIR, 'v2_engineering_paper.md'), mdContent, 'utf-8');

  // 2. OpenXML PPTX Deck with Presenter Speaker Notes via JSZip
  const zip = new JSZip();

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>
</Types>`);

  zip.file('ppt/slides/slide1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p><a:r><a:t>AntiGravity V2 Slide Intelligence</a:t></a:r></a:p>
          <a:p><a:r><a:t>Q1: What stage handles presenter speaker note binding?</a:t></a:r></a:p>
          <a:p><a:r><a:t>A) Layout Engine</a:t></a:r></a:p>
          <a:p><a:r><a:t>B) Question Understanding Engine</a:t></a:r></a:p>
          <a:p><a:r><a:t>C) Format Router</a:t></a:r></a:p>
          <a:p><a:r><a:t>D) Vision Engine</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`);

  zip.file('ppt/notesSlides/notesSlide1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p><a:r><a:t>Answer: B. Stage 10 Question Understanding Engine binds ppt/notesSlides XML nodes to question blocks.</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:notes>`);

  const pptxBuf = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(path.join(V2_GOLDEN_CORPUS_DIR, 'v2_slides_deck.pptx'), pptxBuf);

  console.log('[generateV2GoldenCorpus] Golden corpus generation complete!');
}

if (process.argv[1].endsWith('generate-v2-golden-corpus.ts')) {
  generateV2GoldenCorpus();
}
