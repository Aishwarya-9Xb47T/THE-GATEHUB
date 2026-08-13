import { Link, useLocation } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ShimmerHeading } from "@/components/landing/ShimmerHeading";
import { BrandMark } from "@/components/common/Logo";
import { FooterAssistantAction } from "@/assistant/FooterAssistantAction";
import { isLandingPath } from "@/lib/navigation";
import { Linkedin, Instagram, Mail } from "lucide-react";

const JOURNEY = [
  "Learn",
  "Practice",
  "Build",
  "Certify",
  "Research",
  "Innovate",
  "Lead",
] as const;

const fade = (delay: number, reduced: boolean) =>
  reduced
    ? {}
    : {
        initial: { opacity: 0, y: 16 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-40px" },
        transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] },
      };

export function GlobalFooter() {
  const reducedMotion = useReducedMotion();
  const motionOff = !!reducedMotion;
  const location = useLocation();
  const showAssistant = !isLandingPath(location.pathname);

  return (
    <footer data-floating-obstacle="site-footer" className="site-footer w-full mt-auto border-t border-border/40">
      <div className="site-footer__glow" aria-hidden />

      <div className="landing-shell site-footer__shell py-12 md:py-16">
        <div className="site-footer__inner">
          <motion.div className="site-footer__brand" {...fade(0, motionOff)}>
            <div className="site-footer__logo-wrap">
              <BrandMark size="xl" className="site-footer__logo" />
            </div>
            <ShimmerHeading as="p" className="site-footer__brand-name font-display">
              THE GATEHUB
            </ShimmerHeading>
          </motion.div>

          <motion.p className="site-footer__tagline" {...fade(0.06, motionOff)}>
            Empowering learners to
          </motion.p>

          <motion.div
            className="site-footer__journey"
            role="list"
            aria-label="Learner journey"
            {...fade(0.1, motionOff)}
          >
            {JOURNEY.map((step, index) => (
              <span key={step} className="site-footer__journey-step" role="listitem">
                {step}
                {index < JOURNEY.length - 1 && (
                  <span className="site-footer__journey-arrow" aria-hidden>
                    →
                  </span>
                )}
              </span>
            ))}
          </motion.div>

          <div className="site-footer__rule" aria-hidden />

          <motion.div className="site-footer__credit" {...fade(0.14, motionOff)}>
            <span className="site-footer__label">Designed &amp; Developed by</span>
            <span className="site-footer__name">N S Aishwarya</span>
          </motion.div>

          <div className="site-footer__rule" aria-hidden />

          <motion.div className="site-footer__credit" {...fade(0.18, motionOff)}>
            <span className="site-footer__label">Platform Vision &amp; Leadership</span>
            <span className="site-footer__name">Shoeb Ahmad</span>
            <span className="site-footer__roles">
              Founder <span aria-hidden>•</span> Platform Director <span aria-hidden>•</span> Admin{" "}
              <span aria-hidden>•</span> Lead Instructor
            </span>
          </motion.div>

          <div className="site-footer__rule" aria-hidden />

          <motion.div className="site-footer__social" {...fade(0.2, motionOff)}>
            <ShimmerHeading as="h3" className="site-footer__social-heading font-display">
              CONNECT WITH THE GATEHUB
            </ShimmerHeading>
            <div className="site-footer__social-links">
              <a
                href="https://www.linkedin.com/in/thegatehub/"
                target="_blank"
                rel="noopener noreferrer"
                className="site-footer__social-link"
                aria-label="Connect with THE GATEHUB on LinkedIn"
                title="LinkedIn"
              >
                <Linkedin className="site-footer__social-icon" aria-hidden />
                <span>LinkedIn</span>
              </a>
              <a
                href="https://www.instagram.com/thegatehub?igsh=YnIxdDcwczg4M2hr"
                target="_blank"
                rel="noopener noreferrer"
                className="site-footer__social-link"
                aria-label="Follow THE GATEHUB on Instagram"
                title="Instagram"
              >
                <Instagram className="site-footer__social-icon" aria-hidden />
                <span>Instagram</span>
              </a>
              <a
                href="mailto:thegatehub2020@gmail.com"
                className="site-footer__social-link"
                aria-label="Email THE GATEHUB"
                title="Email"
              >
                <Mail className="site-footer__social-icon" aria-hidden />
                <span>thegatehub2020@gmail.com</span>
              </a>
            </div>
          </motion.div>

          <div className="site-footer__rule" aria-hidden />

          <motion.nav
            className="site-footer__nav"
            aria-label="Footer navigation"
            {...fade(0.24, motionOff)}
          >
            <Link to="/help" className="site-footer__nav-link">
              Help Center
            </Link>
            <span className="site-footer__nav-dot" aria-hidden>
              •
            </span>
            <Link to="/help/faq" className="site-footer__nav-link">
              FAQ
            </Link>
            <span className="site-footer__nav-dot" aria-hidden>
              •
            </span>
            <Link to="/help/student" className="site-footer__nav-link">
              Student Manual
            </Link>
          </motion.nav>

          <motion.p className="site-footer__copyright" {...fade(0.28, motionOff)}>
            © {new Date().getFullYear()} THE GATEHUB. All rights reserved.
          </motion.p>
        </div>

        {showAssistant && (
          <div className="site-footer__assistant-corner" aria-label="Footer utility actions">
            <FooterAssistantAction />
          </div>
        )}
      </div>
    </footer>
  );
}
