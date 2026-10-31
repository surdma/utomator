import React from 'react';

const PageLayout: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => {
  return (
    <div className={`mx-auto w-full max-w-7xl px-6 md:px-8 ${className}`}>
      {children}
    </div>
  );
};

export default PageLayout;
