import { useState } from 'react';
import { ArrowLeft, BookOpen, Clock, User, ChevronRight } from 'lucide-react';
import { sanitizeHtml } from '@/lib/sanitizeHtml';

interface Course {
  id: string;
  title: string;
  description: string;
  latexContent: string;
  htmlContent: string;
  createdAt: Date;
  updatedAt: Date;
}

export function CourseViewer({ 
  courses, 
  onBack 
}: { 
  courses: Course[];
  onBack: () => void;
}) {
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  if (selectedCourse) {
    return (
      <div className="min-h-screen bg-white">
        {/* Course Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
          <div className="w-full min-w-0 px-6 py-8">
            <button
              onClick={() => setSelectedCourse(null)}
              className="flex items-center space-x-2 text-white/80 hover:text-white mb-6 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Courses</span>
            </button>
            
            <h1 className="text-3xl font-bold mb-4">{selectedCourse.title}</h1>
            <p className="text-xl text-white/90 mb-6">{selectedCourse.description}</p>
            
            <div className="flex items-center space-x-6 text-white/80">
              <div className="flex items-center space-x-2">
                <Clock className="w-5 h-5" />
                <span>Updated {selectedCourse.updatedAt.toLocaleDateString()}</span>
              </div>
              <div className="flex items-center space-x-2">
                <User className="w-5 h-5" />
                <span>Interactive Learning</span>
              </div>
            </div>
          </div>
        </div>

        {/* Course Content */}
        <div className="w-full min-w-0 px-6 py-8">
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <div 
              className="prose prose-lg max-w-none text-gray-900"
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(selectedCourse.htmlContent || '<p class="text-gray-500">No content available yet.</p>')
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold text-gray-900">Available Courses</h3>
          <p className="text-gray-600 mt-2">Explore interactive learning resources with LaTeX-powered content</p>
        </div>
      </div>

      {courses.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="w-20 h-20 mx-auto mb-6 text-gray-300" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Courses Available</h3>
          <p className="text-gray-600">Check back later for new learning content</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {courses.map((course) => (
            <div
              key={course.id}
              onClick={() => setSelectedCourse(course)}
              className="group bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:border-blue-300 transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                      <BookOpen className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h4 className="text-xl font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {course.title}
                      </h4>
                      <p className="text-sm text-gray-500">Interactive Course</p>
                    </div>
                  </div>
                  
                  <p className="text-gray-600 mb-4 leading-relaxed">{course.description}</p>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <div className="flex items-center space-x-1">
                        <Clock className="w-4 h-4" />
                        <span>Updated {course.updatedAt.toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <User className="w-4 h-4" />
                        <span>Self-paced</span>
                      </div>
                    </div>
                    
                    <button className="flex items-center space-x-2 text-blue-600 hover:text-blue-700 font-medium transition-colors">
                      <span>Start Learning</span>
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
