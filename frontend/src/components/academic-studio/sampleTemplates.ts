export const ACADEMIC_COURSE_SAMPLE_TEX = `\\documentclass{article}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{listings}
\\usepackage{xcolor}

\\newcommand{\\course}[1]{}
\\newcommand{\\chapter}[1]{}
\\newcommand{\\lesson}[1]{}
\\newcommand{\\overview}[1]{}
\\newcommand{\\video}[1]{}
\\newcommand{\\quiz}[1]{}
\\newcommand{\\practice}[1]{}
\\newcommand{\\assignment}[1]{}

\\title{Deep Learning}
\\author{Instructor Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\course{
title={Deep Learning},
description={Complete Deep Learning Course},
price={0},
difficulty={Advanced},
category={Data Science},
subcategory={Deep Learning}
}

\\tableofcontents

\\chapter{
title={Neural Networks},

\\lesson{
title={Perceptrons},

\\overview{
text={Introduction to perceptrons and their role in neural network history.}
}

\\video{
type={youtube},
url={https://www.youtube.com/watch?v=IHZwWFHWa-w}
}

\\quiz{
question={Who invented the perceptron?},
optionA={Minsky},
optionB={Rosenblatt},
optionC={Hinton},
optionD={LeCun},
correct={B},
explanation={Frank Rosenblatt developed the perceptron in 1957.}
}
}
}

\\end{document}`;

export const LEARNING_UNIVERSE_SAMPLE_TEX = `\\documentclass{article}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{listings}
\\usepackage{xcolor}

\\newcommand{\\learninguniverse}[1]{}
\\newcommand{\\track}[1]{}
\\newcommand{\\module}[1]{}
\\newcommand{\\lesson}[1]{}
\\newcommand{\\overview}[1]{}
\\newcommand{\\overviewmarkdown}[1]{}
\\newcommand{\\video}[1]{}
\\newcommand{\\practice}[1]{}
\\newcommand{\\quiz}[1]{}
\\newcommand{\\checkpoint}[1]{}
\\newcommand{\\discussion}[1]{}
\\newcommand{\\project}[1]{}
\\newcommand{\\resource}[1]{}

\\title{AI \\& Machine Learning Mastery}
\\author{Instructor Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\learninguniverse{
title={AI and Machine Learning Mastery},
description={Comprehensive AI and ML course from foundations to deep learning},
difficulty={Beginner to Advanced},
estimatedHours={80},
skills={Python,Machine Learning,Deep Learning},
category={Artificial Intelligence}
}

\\tableofcontents

\\track{
title={Machine Learning Foundations},
description={Build your core AI and ML knowledge},

\\module{
title={Introduction to AI},
description={Start your AI journey here},

\\lesson{
title={What is AI},
overviewmarkdown={
What is Artificial Intelligence

Artificial Intelligence is the simulation of human intelligence in machines.
}
}

\\quiz{
question={What is Artificial Intelligence?},
optionA={Type of robot},
optionB={Simulation of human intelligence in machines},
optionC={Programming language},
optionD={Database type},
correct={B},
explanation={AI simulates human intelligence in machines.}
}
}
}

\\end{document}`;
