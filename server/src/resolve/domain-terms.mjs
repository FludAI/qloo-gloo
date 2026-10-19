// Domain vocabulary that general English dictionaries miss. Extend freely, or load a
// fuller list (e.g. NLM MeSH, under NLM's terms) with scripts/ at build time.
export const DOMAIN_TERMS = `
cholecystokinin cholecystitis cholecystectomy cystitis cholesterol bradykinin kinesin cytokinesis
gallbladder pancreas pancreatic secretin gastrin ghrelin leptin insulin glucagon somatostatin
amylase lipase trypsin pepsin bilirubin hepatocyte cholangitis cholelithiasis choledocholithiasis
appendectomy tonsillectomy hysterectomy nephrectomy mastectomy laparoscopy endoscopy colonoscopy
gastroenteritis hepatitis nephritis arthritis dermatitis meningitis encephalitis pneumonia bronchitis
tachycardia bradycardia arrhythmia myocardium pericardium endocardium atherosclerosis thrombosis embolism
hypertension hypotension hyperglycemia hypoglycemia hyperthyroidism hypothyroidism erythrocyte leukocyte
thrombocyte lymphocyte neutrophil eosinophil basophil macrophage hemoglobin myoglobin fibrinogen
mitochondria ribosome endoplasmic reticulum cytoplasm cytoskeleton microtubule centrosome chromatin
mitosis meiosis apoptosis phagocytosis pinocytosis exocytosis endocytosis homeostasis
neuron synapse dendrite axon myelin acetylcholine dopamine serotonin norepinephrine epinephrine
oxytocin vasopressin cortisol aldosterone testosterone estrogen progesterone prolactin melatonin
pharmacokinetics pharmacodynamics bioavailability glomerulus nephron alveolus bronchiole diaphragm
osteoporosis osteoblast osteoclast chondrocyte tendon ligament cartilage sarcomere
antibody antigen immunoglobulin cytokine interleukin interferon histamine prostaglandin
peristalsis chyme villi duodenum jejunum ileum esophagus epiglottis pharynx larynx trachea
heteroscedasticity homoscedasticity autocorrelation multicollinearity stochastic stationarity
regression bayesian posterior likelihood prior entropy variance covariance kurtosis skewness
calibration discrimination overfitting regularization backpropagation perceptron transformer
logarithm logistic sigmoid softmax gradient eigenvalue eigenvector determinant orthogonal
amortization depreciation capitalization arbitrage collateral derivative hedging liquidity
volatility annuity perpetuity securitization tranche covenant indemnity escrow fiduciary
`.trim().split(/\s+/);

// Multi-word phrases resolve as a whole.
export const DOMAIN_PHRASES = [
  "brier score", "log loss", "expected value", "standard deviation", "confidence interval",
  "p value", "net present value", "internal rate of return", "discounted cash flow",
  "proper scoring rule", "nash equilibrium", "prisoner's dilemma", "game theory",
  "endoplasmic reticulum", "central limit theorem", "law of large numbers",
];
