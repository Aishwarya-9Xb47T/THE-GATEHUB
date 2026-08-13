/** Smart scaffolding templates for LU 2.1 authoring wizards */

export function scaffoldMinimalLesson(title: string): string {
  return `\\lesson{title={${title}}}\n`;
}

export function scaffoldLessonContent(title: string): string {
  return `\\lesson{title={${title}}}

\\overviewmarkdown={
Welcome to ${title}. In this lesson you will learn the core concepts and apply them through practice.
}

\\theory{title={Learning Objectives},body={
By the end of this lesson you will be able to:
1. Explain the key concepts
2. Apply techniques in guided practice
3. Complete the lesson checkpoint
}}

\\theory{title={Core Content},body={
Add your main teaching content here. Use clear explanations, examples, and visuals.
}}

\\practice{
language={python},
startercode={
# Your practice starter code
print("Hello, learner!")
},
expectedoutput={Hello, learner!}
}

\\quiz{
question={Sample review question?},
optionA={Option A},
optionB={Option B},
optionC={Option C},
optionD={Option D},
correct={B},
explanation={Add explanation for the correct answer.}
}

\\checkpoint{title={Lesson complete — great work!}}

\\resource{type={link},title={Further Reading},url={https://example.com}}
`;
}

export function scaffoldQuizContent(title = "Module Quiz"): string {
  return `\\quiz{
title={${title}},
question={What is the main takeaway from this module?},
optionA={First option},
optionB={Second option},
optionC={Third option},
optionD={Fourth option},
correct={B},
explanation={Explain why the correct answer is right and why others are not.}
}
`;
}

export function scaffoldQuizQuestionContent(question = "Review question?", questionType = "multiple-choice"): string {
  void questionType;
  return `\\quiz{
question={${question}},
optionA={Option A},
optionB={Option B},
optionC={Option C},
optionD={Option D},
correct={B},
explanation={Add explanation for the correct answer.}
}
`;
}

export function scaffoldResourceItemContent(title = "Reference", resourceType = "link"): string {
  if (resourceType === "pdf") {
    return `\\download{title={${title}},file={assets/pdf/${title.toLowerCase().replace(/\s+/g, "-")}.pdf}}
`;
  }
  return `\\resource{type={${resourceType}},title={${title}},url={https://example.com}}
`;
}

export function scaffoldProjectContent(title = "Capstone Project"): string {
  return `\\project{
title={${title}},
description={Apply everything you learned in this module to a real-world scenario.},
difficulty={Intermediate},
instructions={
1. Read the project brief carefully
2. Complete all deliverables listed below
3. Submit according to the submission guidelines
},
deliverables={Working solution, documentation, and demo video},
rubric={
Correctness (40%), Code quality (30%), Documentation (20%), Presentation (10%)
},
submissionType={zip},
expectedOutput={A complete, tested solution with README}
}
`;
}

export function scaffoldAssignmentContent(title = "Assignment"): string {
  return `\\assignment{
title={${title}},
duedate={2026-12-31},
points={100},
instructions={Complete all problems and submit your work before the due date.}
}
`;
}

export function scaffoldDiscussionContent(prompt = "What was the most challenging concept in this module?"): string {
  return `\\discussion{prompt={${prompt}}}
`;
}

export function scaffoldResourceContent(title = "Reference Material"): string {
  return `\\resource{type={link},title={${title}},url={https://example.com}}
\\download{title={${title} PDF},file={assets/pdf/reference.pdf}}
`;
}

export function scaffoldOverviewContent(title = "Lesson Overview"): string {
  return `\\overviewmarkdown={
Welcome to ${title}. Add your lesson introduction and learning goals here.
}
`;
}

export function scaffoldObjectivesContent(): string {
  return `\\theory{title={Learning Objectives},body={
By the end of this lesson you will be able to:
1. Explain the key concepts
2. Apply techniques in guided practice
3. Complete the lesson checkpoint
}}
`;
}

export function scaffoldTopicsContent(title = "Core Content"): string {
  return `\\theory{title={${title}},body={
Add your main teaching content and topic explanations here.
}}
`;
}

export function scaffoldExamplesContent(): string {
  return `\\theory{title={Examples},body={
Walk through worked examples that illustrate the concepts.
}}
`;
}

export function scaffoldPracticeContent(): string {
  return `\\practice{
language={python},
startercode={
# Your practice starter code
print("Hello, learner!")
},
expectedoutput={Hello, learner!}
}
`;
}

export function scaffoldTrackContent(title: string, description = ""): string {
  return `\\track{
title={${title}},
description={${description}},
learningOutcomes={Learners will master the skills in this track.},
careerOutcomes={Prepare for roles requiring this expertise.},
difficulty={Beginner}
}
`;
}

export function scaffoldModuleContent(title: string, description = ""): string {
  return `\\module{
title={${title}},
description={${description}},
prerequisites={},
learningOutcomes={},
estimatedHours={2}
}
`;
}

export function scaffoldCodingLabContent(title = "Coding Lab", topic = "the lesson topic"): string {
  return `\\codinglab{
title={${title}},
language={python},
startercode={
# ${topic} — complete the exercise
def solve():
    # Your code here
    pass

solve()
},
instructions={Apply what you learned about ${topic}. Implement the solution and verify the output.},
expectedoutput={},
timeLimitMs={10000}
}
`;
}

export function scaffoldResearchPaperContent(title = "Research Paper", topic = "the subject"): string {
  return `\\researchpaper{
title={${title}},
paperType={research},
abstract={This paper surveys key concepts in ${topic} and their practical applications.},
\\researchsection{title={Introduction},body={Introduce ${topic} and why it matters to learners.}}
\\researchsection{title={Key Findings},body={Summarize the main ideas and evidence.}}
\\researchsection{title={Conclusion},body={Discuss implications and future directions.}}
}
`;
}

export function scaffoldNotebookContent(title = "Lesson Notebook"): string {
  return `\\notebook{
title={${title}},
kernel={python},
\\notebookcell{type={markdown},source={# ${title}\\n\\nFollow along with the code cells below.}}
\\notebookcell{type={code},source={# Setup\\nprint("Notebook ready")}}
}
`;
}

export function scaffoldReflectionContent(prompt?: string): string {
  return `\\reflection{prompt={${prompt ?? "What was the most important concept you learned? What questions do you still have?"}}}
`;
}

export function scaffoldReferencesContent(): string {
  return `\\references{
\\referenceitem{citation={Author, A. (2024). Title of Reference. Publisher.}}
\\referenceitem{citation={Organization. (2023). Online Resource. Retrieved from https://example.com}}
}
`;
}

export function scaffoldCheckpointContent(title = "Lesson complete"): string {
  return `\\checkpoint{title={${title}},message={Excellent work! You are ready for the next lesson.}}
`;
}
