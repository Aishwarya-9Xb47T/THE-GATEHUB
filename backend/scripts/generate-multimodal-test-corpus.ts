import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

const CORPUS_DIR = path.resolve('test-corpus');

export async function generateTestCorpus() {
  if (!fs.existsSync(CORPUS_DIR)) {
    fs.mkdirSync(CORPUS_DIR, { recursive: true });
  }

  console.log('[generateTestCorpus] Generating Multi-Format Test Corpus in:', CORPUS_DIR);

  // 1. Generate Markdown File with Code, Math, Mermaid Diagram, Tables, Questions
  const mdContent = `# Quantum Computing & Algorithms

Author: GateHub Quantum Institute

## 1. Introduction & Mathematics
Schrödinger equation representation:
$$\\mathbf{H} |\\psi\\rangle = E |\\psi\\rangle$$

Key Pauli matrices:
- $\\sigma_x = \\begin{matrix} 0 & 1 \\\\ 1 & 0 \\end{matrix}$
- $\\sigma_z = \\begin{matrix} 1 & 0 \\\\ 0 & -1 \\end{matrix}$

## 2. Quantum Circuit Simulation in Python
\`\`\`python
import numpy as np

def apply_hadamard(state):
    H = (1 / np.sqrt(2)) * np.array([[1, 1], [1, -1]])
    return np.dot(H, state)

state_0 = np.array([1, 0])
superposition = apply_hadamard(state_0)
print("Superposition:", superposition)
\`\`\`

## 3. Quantum Architecture Diagram
\`\`\`mermaid
graph TD
    A[Classic Control Unit] -->|Pulse Signal| B[Cryogenic Interface]
    B -->|Microwave Drive| C[Transmon Qubit Array]
    C -->|Readout Signal| D[Josephson Parametric Amplifier]
    D -->|Digitized Data| A
\`\`\`

## 4. Performance Comparison Table
| Architecture | Qubit Count | Coherence Time (us) | Gate Error Rate |
| Superconducting | 127 | 100 | 0.1% |
| Trapped Ion | 32 | 1000000 | 0.01% |
| Photonic | 216 | N/A | 0.5% |

## 5. Assessment Questions

Q1: What is the matrix representation of the Hadamard gate operator?
A) \\frac{1}{\\sqrt{2}} \\begin{matrix} 1 & 1 \\\\ 1 & -1 \\end{matrix}
B) \\begin{matrix} 0 & 1 \\\\ 1 & 0 \\end{matrix}
C) \\begin{matrix} 1 & 0 \\\\ 0 & 1 \\end{matrix}
D) \\frac{1}{2} \\begin{matrix} 1 & 0 \\\\ 0 & 1 \\end{matrix}

Answer: A
Explanation: The Hadamard gate maps basis state |0> to (|0> + |1>)/sqrt(2).

Q2: Which quantum architecture currently exhibits the longest coherence time?
A) Superconducting
B) Trapped Ion
C) Photonic
D) Semiconductor

Answer: B
[Notes]: Trapped Ion qubits feature coherence times exceeding seconds or minutes.
`;

  fs.writeFileSync(path.join(CORPUS_DIR, 'quantum_computing.md'), mdContent, 'utf-8');

  // 2. Generate PPTX Slide Presentation with Speaker Notes via JSZip
  const zip = new JSZip();

  // [Content_Types].xml
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>
</Types>`);

  // ppt/slides/slide1.xml
  zip.file('ppt/slides/slide1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p><a:r><a:t>Artificial Intelligence & Deep Learning</a:t></a:r></a:p>
          <a:p><a:r><a:t>Q1: What optimizer is commonly used in transformer model training?</a:t></a:r></a:p>
          <a:p><a:r><a:t>A) SGD</a:t></a:r></a:p>
          <a:p><a:r><a:t>B) AdamW</a:t></a:r></a:p>
          <a:p><a:r><a:t>C) RMSProp</a:t></a:r></a:p>
          <a:p><a:r><a:t>D) Adagrad</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`);

  // ppt/notesSlides/notesSlide1.xml (Speaker Notes containing the Answer Signal)
  zip.file('ppt/notesSlides/notesSlide1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p><a:r><a:t>Answer: B. AdamW decouples weight decay from gradient updates, which is vital for transformer stability.</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:notes>`);

  const pptxBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(path.join(CORPUS_DIR, 'ai_deep_learning.pptx'), pptxBuffer);

  console.log('[generateTestCorpus] Corpus generation complete!');
}

if (process.argv[1].endsWith('generate-multimodal-test-corpus.ts')) {
  generateTestCorpus();
}
