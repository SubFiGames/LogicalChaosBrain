#import <Foundation/Foundation.h>

#ifdef __cplusplus
namespace logicalchaos { class LogicalChaosEngine; }
#endif

@interface LCAudioEngine : NSObject

- (instancetype)initWithEngine:(logicalchaos::LogicalChaosEngine*)engine;

- (BOOL)startAndReturnError:(NSError**)error;
- (void)stop;
- (void)resetPlayback;
- (BOOL)isRunning;

- (void)setTempo:(float)tempo;
- (void)setMasterVolume:(float)volume;
- (void)setSynthWave:(int)wave;
- (void)setSynthCutoff:(float)cutoff;
- (void)setSynthResonance:(float)resonance;
- (void)setSynthDecay:(float)decay;

@end
