export default function PremiumCertificate() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <iframe
        src="/src/components/certificate/PremiumCertificate.html"
        className="w-full h-full border-0 shadow-2xl"
        style={{ width: '1200px', height: '800px' }}
        title="GATEHUB Professional Certificate"
      />
    </div>
  );
}
