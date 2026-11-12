import numpy as np, warnings
from scipy import stats
from statsmodels.stats.multitest import multipletests
warnings.filterwarnings("ignore")
print("== Gemini GLD-01")
x=np.arange(10); y=np.array([1.2,1.5,1.4,2.1,2.3,2.0,2.8,3.1,3.0,3.5])
r=stats.theilslopes(y,x,0.95); print("theilslopes:",r.slope,r.intercept,r.low_slope,r.high_slope)
kt=stats.kendalltau(x,y); print("kendalltau:",kt.statistic,kt.pvalue)
import pymannkendall as mk
o=mk.original_test(y); print("mk.original_test Tau,p,slope,intercept:",o.Tau,o.p,o.slope,o.intercept)
print("== Gemini GLD-02")
p=np.r_[np.full(5,0.0005),np.linspace(0.04,0.99,95)]
rej=multipletests(p,alpha=0.05,method='fdr_bh')[0]; print("BH rejects:",rej.sum()," naive p<0.05:",(p<0.05).sum(), " smallest uniform values:",np.linspace(0.04,0.99,95)[:3])
print("== Gemini SYN-06")
x=np.arange(10); y=np.array([1,2,3,4,5,6,7,500,9,10.])
r=stats.theilslopes(y,x,0.95); print("theilslopes:",r.slope,r.intercept,r.low_slope,r.high_slope); print("OLS slope:",stats.linregress(x,y).slope)
print("== Gemini SYN-07")
y=np.array([0,0,0,0,0,2,0,5,8,12.]); r=stats.theilslopes(y,x,0.95); print("theilslopes:",r.slope,r.intercept,r.low_slope,r.high_slope)
kt=stats.kendalltau(x,y); print("kendalltau tau_b, p:",kt.statistic,kt.pvalue)
print("== UNI-01 (1 mm/h)")
for yr in (2020,2021):
    import calendar
    d=[calendar.monthrange(yr,m)[1] for m in range(1,13)]; print(yr,"Feb mm:",24*d[1]," annual mm:",24*sum(d))
print("== UNI-04 weighted mean:",(10*np.cos(0)+20*np.cos(np.deg2rad(60)))/(np.cos(0)+np.cos(np.deg2rad(60))))
print("== Qwen U-01: 1 kg m-2 s-1 =", 86400, "mm/day (1 kg/m2 = 1 mm); Qwen's x1000 gives", 86400*1000)
print("== Gemini map counts: 1-degree cells", 180*360, " expected false positives at 0.05:", 0.05*180*360)
print("== GPT-6 architect sizes (MiB):", 540*36*72*4/2**20, 2*540*36*72*4/2**20, 2*540*36*72/2**20)
print("== DeepSeek sizes (MB):", 648*50*8*4/1e6, 2592*50*8*4/1e6)
print("== window Sat 09:00 -> Sun 23:59 hours:", 24+14+59/60)
print("== Minimax MDT illustration")
n=30; Sxx=n*(n**2-1)/12; print(" sqrt Sxx:",np.sqrt(Sxx))
tq=stats.t.ppf(0.975,n-2)+stats.t.ppf(0.80,n-2); print(" t sum:",tq," MDT/decade:",10*tq*0.11/np.sqrt(Sxx)," with r1=0.3:",10*tq*0.11/np.sqrt(Sxx)*np.sqrt(1.3/0.7))
print(" case1 MDT (s_e=1) per yr:",tq/np.sqrt(Sxx)," case2 n_eff r1=0.6:",n*(1-0.6)/(1+0.6)," case2 MDT:",tq/np.sqrt(Sxx)*np.sqrt(1.6/0.4))
t=np.arange(30); step=np.where(t>=15,2.0,0); print(" case4 expected OLS slope of pure step:",np.polyfit(t,step,1)[0], " (Minimax said 0.068)")
print("== GPT-6 statistician detectability (annual): sigma=1, beta=0.1, alpha=.05 two-sided, power .9")
z=stats.norm.ppf(0.975)+stats.norm.ppf(0.9)
for phi in (0,0.3,0.6):
    need=12*z**2*(1+phi)/(1-phi)/0.1**2
    n=2
    while n*(n**2-1)<need: n+=1
    print("  phi",phi,"n =",n)
print("== GLM n* formula check (48 = 2^2*12)")
def gl(w,s,phi): return (48*s**2*(1+phi)/((1-phi)*w**2))**(1/3)
for w,s,phi in [(0.03,0.15,0.2),(12,360,0.3),(24,360,0.3),(0.005,0.03,0.3),(4,20,0.1),(5,15,0.4)]: print("  ",w,s,phi,round(gl(w,s,phi),1))
print("== v2 Weatherhead annual adaptation [3.3*sqrt(12)*sigma/w*sqrt((1+phi)/(1-phi))]^(2/3), sigma=1,w=0.1")
for phi in (0,0.3,0.6): print("  phi",phi, round((3.3*np.sqrt(12)*1/0.1*np.sqrt((1+phi)/(1-phi)))**(2/3),1))
