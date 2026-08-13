import { publishLearningUniverse } from "./src/controllers/learning-universe-controller.js";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const testLatex = `
\\documentclass{article}
\\begin{document}
\\learninguniverse{
title={AI & Machine Learning Mastery}
description={Complete learning path from beginner to advanced in AI and ML, covering foundational concepts, practical labs, and real-world projects}
difficulty={Intermediate}
estimatedHours={40}
}
\\track{
title={Foundations of AI}
description={Learn core concepts of Artificial Intelligence}
learningOutcomes={Understand AI basics,Identify types of Machine Learning,Trace AI history}
}
\\module{
title={Introduction to AI}
description={What is Artificial Intelligence and how did we get here?}
estimatedHours={5}
}
\\lesson{title={What is Artificial Intelligence?}}
\\overview{Welcome to AI & Machine Learning Mastery! In this first lesson, we'll define what AI actually is, trace its history from early ideas to modern breakthroughs, and explore its main subfields.}
\\theory{title={What is AI?},body={Artificial Intelligence (AI) is the simulation of human intelligence in machines that are programmed to think like humans and mimic their actions. Machine Learning (ML) is a subset of AI that enables computers to learn from data without being explicitly programmed.}}
\\note{Remember: AI ≠ Machine Learning! ML is a subset of AI.}
\\tip{Use Google Colab for free GPU access to run deep learning models!}
\\warning{Always check the licenses of datasets you use—some are for non-commercial use only!}
\\video{
type={youtube}
url={https://www.youtube.com/watch?v=Jc0-IMr5zXg}
title={Introduction to AI}
}
\\image{
path={https://example.com/ai-hierarchy.png}
caption={AI vs ML vs Deep Learning vs Data Science}
alt={Diagram showing AI hierarchy}
}
\\codeexample{
language={python}
code={def ai_greet(name):
    return f"Hello, {name}! I'm your AI assistant!"

print(ai_greet("Student"))}
output={Hello, Student! I'm your AI assistant!}
}
\\practice{
title={Hello AI World}
language={python}
startercode={def ai_greet():
    # Write your code here!
    pass}
solution={def ai_greet():
    return "Hello, AI!"

print(ai_greet())}
expectedoutput={Hello, AI!}
hints={
Define a function called ai_greet(),
Return the string "Hello, AI!",
Call the function and print the result
}
}
\\quiz{
title={AI Basics Quiz}
}
\\question{
text={What is the main goal of Artificial Intelligence?}
explanation={AI aims to create systems that can perform tasks requiring human intelligence.}
difficulty={Easy}
points={10}
}
\\option{text={To replace humans entirely},iscorrect={false}}
\\option{text={To simulate human intelligence in machines},iscorrect={true}}
\\option{text={To build faster computers},iscorrect={false}}
\\question{
text={Which of the following is NOT a type of Machine Learning?}
explanation={Semi-supervised is a sub-type, but the main categories are Supervised, Unsupervised, and Reinforcement.}
difficulty={Medium}
points={15}
}
\\option{text={Supervised},iscorrect={false}}
\\option{text={Unsupervised},iscorrect={false}}
\\option{text={Semi-supervised},iscorrect={true}}
\\option{text={Reinforcement},iscorrect={false}}
\\summary{In this lesson, we covered: What AI is, AI vs ML vs Deep Learning, Brief history of AI, Types of ML}
\\keypoints{
AI is broad field of making intelligent machines,
ML is subset of AI that learns from data,
Deep Learning is subset of ML using neural networks
}
\\checkpoint{title={AI Basics Checkpoint}}
\\discussion{prompt={What do you think is the most exciting AI application today?}}
\\resource{
type={website}
title={AI History Wikipedia}
url={https://en.wikipedia.org/wiki/History_of_artificial_intelligence}
}
\\resource{
type={book}
title={Artificial Intelligence: A Modern Approach}
url={https://example.com/aima-book}
}
\\download{
title={Course Syllabus PDF}
fileUrl={https://example.com/syllabus.pdf}
}
\\finalexam{
title={Final AI & ML Exam}
duration={90 minutes}
}
\\end{document}
`;

async function testPublish() {
  try {
    // Find the first instructor user
    const instructor = await prisma.user.findFirst({
      where: { role: "instructor" },
    });

    if (!instructor) {
      console.error("No instructor user found!");
      return;
    }

    console.log("Publishing test learning universe...");
    const universe = await publishLearningUniverse(testLatex, instructor.id);
    console.log("Successfully published!");
    console.dir(universe, { depth: null });
  } catch (error) {
    console.error("Error publishing:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testPublish();