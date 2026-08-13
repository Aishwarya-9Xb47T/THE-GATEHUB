import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ArrowLeft, Plus, Trash2, Save } from "lucide-react";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { invalidateCourseContentCaches } from "@/lib/courseContentCache";
import { useToastStore } from "@/store/toastStore";

const optionSchema = z.object({
  id: z.string().optional(),
  text: z.string().min(1, "Option text is required"),
  isCorrect: z.boolean().default(false),
});

const questionSchema = z.object({
  id: z.string().optional(),
  text: z.string().min(1, "Question text is required"),
  type: z.enum(["multiple_choice", "multiple_select", "true_false", "short_answer"]),
  marks: z.number().min(0).default(1),
  explanation: z.string().optional(),
  options: z.array(optionSchema).default([]),
});

const quizSchema = z.object({
  title: z.string().min(1, "Quiz title is required"),
  questions: z.array(questionSchema).default([]),
});

type QuizFormValues = z.infer<typeof quizSchema>;

function QuestionEditor({ control, index, removeQuestion, register, watch, setValue }: any) {
  const { fields: optionFields, append: appendOption, remove: removeOption } = useFieldArray({
    control,
    name: `questions.${index}.options`,
  });

  const questionType = watch(`questions.${index}.type`);

  // Auto-config options based on type
  useEffect(() => {
    if (questionType === "true_false" && optionFields.length === 0) {
      appendOption({ text: "True", isCorrect: true });
      appendOption({ text: "False", isCorrect: false });
    }
  }, [questionType, optionFields.length, appendOption]);

  return (
    <Card className="mb-6 relative group border-2 hover:border-primary/50 transition-colors">
      <Button 
        type="button" 
        variant="ghost" 
        size="sm" 
        className="absolute top-4 right-4 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition-all"
        onClick={() => removeQuestion(index)}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
      <CardHeader className="pb-4">
        <div className="flex gap-4 items-start pr-12">
          <div className="flex-1 space-y-2">
            <Controller
              control={control}
              name={`questions.${index}.text`}
              render={({ field }) => (
                <Textarea {...field} placeholder="Question text..." className="text-lg font-medium resize-none border-0 bg-secondary/20 focus-visible:ring-1 focus-visible:bg-background" rows={2} />
              )}
            />
          </div>
          <div className="w-48 space-y-2">
            <Controller
              control={control}
              name={`questions.${index}.type`}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                    <SelectItem value="multiple_select">Multiple Select</SelectItem>
                    <SelectItem value="true_false">True / False</SelectItem>
                    <SelectItem value="short_answer">Short Answer</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {questionType !== "short_answer" && (
          <div className="space-y-3">
            {optionFields.map((opt, optIndex) => (
              <div key={opt.id} className="flex items-center gap-3">
                <Controller
                  control={control}
                  name={`questions.${index}.options.${optIndex}.isCorrect`}
                  render={({ field }) => (
                    <Checkbox 
                      checked={field.value} 
                      onCheckedChange={(checked: boolean) => {
                        // If multiple choice or true/false, uncheck others
                        if (checked && (questionType === "multiple_choice" || questionType === "true_false")) {
                          optionFields.forEach((_, i) => {
                            if (i !== optIndex) setValue(`questions.${index}.options.${i}.isCorrect`, false);
                          });
                        }
                        field.onChange(checked);
                      }} 
                      className="w-5 h-5 rounded-full data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500" 
                    />
                  )}
                />
                <Controller
                  control={control}
                  name={`questions.${index}.options.${optIndex}.text`}
                  render={({ field }) => (
                    <Input {...field} placeholder={`Option ${optIndex + 1}`} className={`flex-1 ${questionType === "true_false" ? "bg-muted cursor-not-allowed" : ""}`} readOnly={questionType === "true_false"} />
                  )}
                />
                {questionType !== "true_false" && (
                  <Button type="button" variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => removeOption(optIndex)}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
            {questionType !== "true_false" && (
              <Button type="button" variant="ghost" size="sm" className="mt-2 text-primary hover:bg-primary/10" onClick={() => appendOption({ text: "", isCorrect: false })}>
                <Plus className="w-4 h-4 mr-2" /> Add Option
              </Button>
            )}
          </div>
        )}

        <div className="flex gap-4 pt-4 border-t">
          <div className="space-y-1 w-24">
            <label className="text-xs font-semibold text-muted-foreground uppercase">Marks</label>
            <Input type="number" min={0} {...register(`questions.${index}.marks`, { valueAsNumber: true })} />
          </div>
          <div className="space-y-1 flex-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase">Feedback / Explanation (Optional)</label>
            <Input placeholder="Shown to students after answering" {...register(`questions.${index}.explanation`)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Need to import X for the option delete button
import { X } from "lucide-react";

export function QuizBuilderPage() {
  const { courseId, lectureId } = useParams<{ courseId: string; lectureId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.add);

  const { data: lecture, isLoading } = useQuery({
    queryKey: ["lectures", lectureId],
    queryFn: async () => {
      const res = await api<any>(`/lectures/${lectureId}`);
      if (res.error) throw new Error(res.error);
      return res.data!.lecture;
    },
    enabled: !!lectureId,
  });

  const form = useForm<QuizFormValues>({
    resolver: zodResolver(quizSchema),
    defaultValues: { title: "", questions: [] },
  });

  const { fields: questionFields, append: appendQuestion, remove: removeQuestion } = useFieldArray({
    control: form.control,
    name: "questions",
  });

  useEffect(() => {
    if (lecture?.quiz) {
      form.reset({
        title: lecture.quiz.title,
        questions: lecture.quiz.questions,
      });
    } else if (lecture && !lecture.quizId) {
      toast({ title: "Error", description: "This lecture does not have an attached quiz.", variant: "destructive" });
    }
  }, [lecture, form, toast]);

  const saveMutation = useMutation({
    mutationFn: async (data: QuizFormValues) => {
      const res = await api(`/quizzes/${lecture?.quizId}`, { method: "PUT", body: data });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lectures", lectureId] });
      invalidateCourseContentCaches(queryClient, courseId);
      toast({ title: "Quiz saved successfully", variant: "success" });
    },
    onError: (err: any) => toast({ title: "Failed to save quiz", description: err.message, variant: "destructive" }),
  });

  const onSubmit = (data: QuizFormValues) => {
    saveMutation.mutate(data);
  };

  if (isLoading) return <div className="p-8">Loading quiz builder...</div>;

  return (
    <div className="w-full min-w-0 space-y-8 pb-24">
      <div className="flex items-center justify-between sticky top-0 z-10 bg-background/80 backdrop-blur-md pt-6 pb-4 border-b">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => navigate(`/instructor/course/${courseId}/edit`)}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <h1 className="text-h3 font-display">{lecture?.title || "Quiz Builder"}</h1>
        </div>
        <Button onClick={form.handleSubmit(onSubmit)} disabled={saveMutation.isPending} size="lg" className="shadow-lg">
          <Save className="w-4 h-4 mr-2" /> {saveMutation.isPending ? "Saving..." : "Save Quiz"}
        </Button>
      </div>

      <div className="space-y-6 pt-4">
        <Card className="border-t-4 border-t-primary shadow-sm bg-card/50">
          <CardContent className="pt-6">
            <Controller
              control={form.control}
              name="title"
              render={({ field, fieldState }) => (
                <div className="space-y-2">
                  <Input {...field} placeholder="Quiz Title" className="text-3xl font-bold h-auto py-3 px-0 border-0 bg-transparent focus-visible:ring-0 rounded-none border-b-2 border-border focus-visible:border-primary placeholder:text-muted-foreground" />
                  {fieldState.error && <p className="text-sm text-destructive">{fieldState.error.message}</p>}
                </div>
              )}
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          {questionFields.map((field, index) => (
            <QuestionEditor 
              key={field.id} 
              index={index} 
              control={form.control} 
              removeQuestion={removeQuestion} 
              register={form.register} 
              watch={form.watch}
              setValue={form.setValue}
            />
          ))}
        </div>

        <Button 
          type="button" 
          variant="outline" 
          size="lg" 
          className="w-full bg-secondary/20 border-dashed border-2 hover:bg-secondary/40 hover:border-primary transition-all py-8"
          onClick={() => appendQuestion({ text: "", type: "multiple_choice", marks: 1, options: [{ text: "Option 1", isCorrect: false }] })}
        >
          <Plus className="w-5 h-5 mr-3" /> Add Question
        </Button>
      </div>
    </div>
  );
}
