import { useState } from 'react';
import { Plus, Edit, Trash2, BookOpen, Save, X } from 'lucide-react';

interface Course {
  id: string;
  title: string;
  description: string;
  latexContent: string;
  htmlContent: string;
  createdAt: Date;
  updatedAt: Date;
}

export function CourseManager({ 
  onCourseSelect, 
  onCreateCourse 
}: { 
  onCourseSelect: (course: Course) => void;
  onCreateCourse: (course: Omit<Course, 'id' | 'createdAt' | 'updatedAt'>) => void;
}) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCourse, setNewCourse] = useState({
    title: '',
    description: '',
    latexContent: '',
    htmlContent: ''
  });

  // Load courses from localStorage on mount
  useState(() => {
    const savedCourses = localStorage.getItem('learning-courses');
    if (savedCourses) {
      setCourses(JSON.parse(savedCourses));
    }
  });

  const handleCreateCourse = () => {
    if (!newCourse.title.trim()) return;

    const course: Course = {
      ...newCourse,
      id: Date.now().toString(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const updatedCourses = [...courses, course];
    setCourses(updatedCourses);
    localStorage.setItem('learning-courses', JSON.stringify(updatedCourses));
    
    onCreateCourse(newCourse);
    setNewCourse({ title: '', description: '', latexContent: '', htmlContent: '' });
    setShowCreateForm(false);
  };

  const handleDeleteCourse = (courseId: string) => {
    const updatedCourses = courses.filter(c => c.id !== courseId);
    setCourses(updatedCourses);
    localStorage.setItem('learning-courses', JSON.stringify(updatedCourses));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-gray-900">Your Courses</h3>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Create Course</span>
        </button>
      </div>

      {/* Create Course Form */}
      {showCreateForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-medium">Create New Course</h4>
            <button
              onClick={() => setShowCreateForm(false)}
              className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Course Title
              </label>
              <input
                type="text"
                value={newCourse.title}
                onChange={(e) => setNewCourse({ ...newCourse, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Mathematics Fundamentals"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={newCourse.description}
                onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                placeholder="Brief description of the course content..."
              />
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={handleCreateCourse}
                disabled={!newCourse.title.trim()}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>Create Course</span>
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Course List */}
      {courses.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-lg font-medium mb-2">No courses created yet</p>
          <p className="text-sm">Click "Create Course" to get started</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {courses.map((course) => (
            <div
              key={course.id}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1" onClick={() => onCourseSelect(course)}>
                  <h4 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                    {course.title}
                  </h4>
                  <p className="text-gray-600 mb-3">{course.description}</p>
                  <div className="flex items-center space-x-4 text-sm text-gray-500">
                    <span>Created {course.createdAt.toLocaleDateString()}</span>
                    <span>•</span>
                    <span>Updated {course.updatedAt.toLocaleDateString()}</span>
                  </div>
                </div>
                
                <div className="flex space-x-2 ml-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCourseSelect(course);
                    }}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit Course"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCourse(course.id);
                    }}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete Course"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
