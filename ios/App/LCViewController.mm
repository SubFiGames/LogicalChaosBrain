#import "LCViewController.h"
#import "LCAudioEngine.h"

#include "LogicalChaosEngine.h"

#include <sstream>

using logicalchaos::LogicalChaosEngine;

@interface LCViewController ()
@property (nonatomic, strong) UILabel* titleLabel;
@property (nonatomic, strong) UILabel* subtitleLabel;
@property (nonatomic, strong) UILabel* statusLabel;
@property (nonatomic, strong) UITextView* patternView;
@property (nonatomic, strong) LCAudioEngine* audioEngine;
@property (nonatomic, strong) UISlider* tempoSlider;
@property (nonatomic, strong) UILabel* tempoValueLabel;
@property (nonatomic, strong) UISlider* mutationSlider;
@property (nonatomic, strong) UILabel* mutationValueLabel;
@property (nonatomic, strong) UISlider* volumeSlider;
@property (nonatomic, strong) UILabel* volumeValueLabel;
@property (nonatomic, strong) UISegmentedControl* rootControl;
@property (nonatomic, strong) UISegmentedControl* styleControl;
@property (nonatomic, strong) UISegmentedControl* scaleControl;
@property (nonatomic, strong) UISegmentedControl* complexityControl;
@property (nonatomic, strong) UISegmentedControl* waveformControl;
@end

@implementation LCViewController
{
    LogicalChaosEngine engine_;
}

- (void)viewDidLoad
{
    [super viewDidLoad];

    self.view.backgroundColor = [UIColor colorWithRed:0.008 green:0.067 blue:0.067 alpha:1.0];

    UIScrollView* scroll = [[UIScrollView alloc] init];
    scroll.translatesAutoresizingMaskIntoConstraints = NO;
    [self.view addSubview:scroll];

    UIStackView* root = [[UIStackView alloc] init];
    root.translatesAutoresizingMaskIntoConstraints = NO;
    root.axis = UILayoutConstraintAxisVertical;
    root.spacing = 14.0;
    root.layoutMarginsRelativeArrangement = YES;
    root.layoutMargins = UIEdgeInsetsMake (22, 18, 22, 18);
    [scroll addSubview:root];

    [NSLayoutConstraint activateConstraints:@[
        [scroll.topAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.topAnchor],
        [scroll.leadingAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.leadingAnchor],
        [scroll.trailingAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.trailingAnchor],
        [scroll.bottomAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.bottomAnchor],

        [root.topAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.topAnchor],
        [root.leadingAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.leadingAnchor],
        [root.trailingAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.trailingAnchor],
        [root.bottomAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.bottomAnchor],
        [root.widthAnchor constraintEqualToAnchor:scroll.frameLayoutGuide.widthAnchor]
    ]];

    self.titleLabel = [[UILabel alloc] init];
    self.titleLabel.text = @"LOGICAL CHAOS";
    self.titleLabel.textColor = [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:1.0];
    self.titleLabel.font = [UIFont systemFontOfSize:30 weight:UIFontWeightBlack];
    self.titleLabel.textAlignment = NSTextAlignmentCenter;
    [root addArrangedSubview:self.titleLabel];

    self.subtitleLabel = [[UILabel alloc] init];
    self.subtitleLabel.text = @"Melody Machine · iOS Standalone";
    self.subtitleLabel.textColor = [UIColor colorWithWhite:0.82 alpha:0.70];
    self.subtitleLabel.font = [UIFont systemFontOfSize:13 weight:UIFontWeightBold];
    self.subtitleLabel.textAlignment = NSTextAlignmentCenter;
    [root addArrangedSubview:self.subtitleLabel];

    self.statusLabel = [[UILabel alloc] init];
    self.statusLabel.text = @"Audio: stopped";
    self.statusLabel.textColor = [UIColor colorWithRed:1.0 green:0.48 blue:1.0 alpha:0.90];
    self.statusLabel.font = [UIFont systemFontOfSize:12 weight:UIFontWeightBold];
    self.statusLabel.textAlignment = NSTextAlignmentCenter;
    [root addArrangedSubview:self.statusLabel];

    UIStackView* transport = [[UIStackView alloc] init];
    transport.axis = UILayoutConstraintAxisHorizontal;
    transport.spacing = 8.0;
    transport.distribution = UIStackViewDistributionFillEqually;
    [root addArrangedSubview:[self panelWithTitle:@"Transport" content:transport]];

    [transport addArrangedSubview:[self makeButton:@"PLAY" action:@selector(playTapped) primary:YES]];
    [transport addArrangedSubview:[self makeButton:@"STOP" action:@selector(stopTapped) primary:NO]];
    [transport addArrangedSubview:[self makeButton:@"GENERATE" action:@selector(generateTapped) primary:NO]];

    UIStackView* edits = [[UIStackView alloc] init];
    edits.axis = UILayoutConstraintAxisHorizontal;
    edits.spacing = 8.0;
    edits.distribution = UIStackViewDistributionFillEqually;
    [root addArrangedSubview:[self panelWithTitle:@"Pattern" content:edits]];

    [edits addArrangedSubview:[self makeButton:@"MUTATE" action:@selector(mutateTapped) primary:NO]];
    [edits addArrangedSubview:[self makeButton:@"CLEAR" action:@selector(clearTapped) primary:NO]];

    UIStackView* controls = [[UIStackView alloc] init];
    controls.axis = UILayoutConstraintAxisVertical;
    controls.spacing = 12.0;
    [root addArrangedSubview:[self panelWithTitle:@"Controls" content:controls]];

    self.tempoSlider = [self makeSliderMin:50 max:220 value:120 action:@selector(tempoChanged:)];
    self.tempoValueLabel = [self valueLabel:@"120 BPM"];
    [controls addArrangedSubview:[self sliderRow:@"Tempo" slider:self.tempoSlider value:self.tempoValueLabel]];

    self.mutationSlider = [self makeSliderMin:0 max:100 value:20 action:@selector(mutationChanged:)];
    self.mutationValueLabel = [self valueLabel:@"20%"];
    [controls addArrangedSubview:[self sliderRow:@"Mutation" slider:self.mutationSlider value:self.mutationValueLabel]];

    self.volumeSlider = [self makeSliderMin:0 max:100 value:80 action:@selector(volumeChanged:)];
    self.volumeValueLabel = [self valueLabel:@"80%"];
    [controls addArrangedSubview:[self sliderRow:@"Master" slider:self.volumeSlider value:self.volumeValueLabel]];

    self.rootControl = [self segmented:@[@"C3", @"D3", @"E3", @"F3", @"G3", @"A3", @"C4"] action:@selector(rootChanged:)];
    self.rootControl.selectedSegmentIndex = 0;
    [controls addArrangedSubview:[self labelledControl:@"Root Note" control:self.rootControl]];

    self.styleControl = [self segmented:@[@"Auto", @"Classical", @"Pop", @"Ambient", @"Synthwave"] action:@selector(styleChanged:)];
    self.styleControl.selectedSegmentIndex = 0;
    [controls addArrangedSubview:[self labelledControl:@"Style" control:self.styleControl]];

    self.scaleControl = [self segmented:@[@"Major", @"Minor", @"Dorian", @"Pent", @"Blues"] action:@selector(scaleChanged:)];
    self.scaleControl.selectedSegmentIndex = 0;
    [controls addArrangedSubview:[self labelledControl:@"Scale" control:self.scaleControl]];

    self.complexityControl = [self segmented:@[@"Simple", @"Nice", @"Adv", @"Wild"] action:@selector(complexityChanged:)];
    self.complexityControl.selectedSegmentIndex = 1;
    [controls addArrangedSubview:[self labelledControl:@"Complexity" control:self.complexityControl]];

    self.waveformControl = [self segmented:@[@"Saw", @"Square", @"Tri", @"Sine"] action:@selector(waveformChanged:)];
    self.waveformControl.selectedSegmentIndex = 0;
    [controls addArrangedSubview:[self labelledControl:@"Waveform" control:self.waveformControl]];

    self.patternView = [[UITextView alloc] init];
    self.patternView.translatesAutoresizingMaskIntoConstraints = NO;
    self.patternView.editable = NO;
    self.patternView.selectable = YES;
    self.patternView.backgroundColor = [UIColor colorWithRed:0.0 green:0.0 blue:0.0 alpha:0.26];
    self.patternView.textColor = [UIColor colorWithWhite:0.92 alpha:1.0];
    self.patternView.font = [UIFont monospacedSystemFontOfSize:12 weight:UIFontWeightRegular];
    self.patternView.layer.cornerRadius = 14.0;
    self.patternView.layer.borderWidth = 1.0;
    self.patternView.layer.borderColor = [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:0.20].CGColor;
    self.patternView.textContainerInset = UIEdgeInsetsMake (12, 12, 12, 12);
    [root addArrangedSubview:[self panelWithTitle:@"64-Step Pattern Memory" content:self.patternView]];

    [self.patternView.heightAnchor constraintGreaterThanOrEqualToConstant:320.0].active = YES;

    engine_.resetToDefaults();
    engine_.triggerEvent ("generate", 1.0);
    self.audioEngine = [[LCAudioEngine alloc] initWithEngine:&engine_];
    [self applyAllControlsToEngineAndRegenerate:NO];
    [self refreshPatternText:@"Generated default pattern from shared C++ engine."];
}

- (UIView*)panelWithTitle:(NSString*)title content:(UIView*)content
{
    UIStackView* panel = [[UIStackView alloc] init];
    panel.axis = UILayoutConstraintAxisVertical;
    panel.spacing = 10.0;
    panel.layoutMarginsRelativeArrangement = YES;
    panel.layoutMargins = UIEdgeInsetsMake (14, 14, 14, 14);
    panel.backgroundColor = [UIColor colorWithRed:0.02 green:0.08 blue:0.08 alpha:0.88];
    panel.layer.cornerRadius = 16.0;
    panel.layer.borderWidth = 1.0;
    panel.layer.borderColor = [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:0.16].CGColor;

    UILabel* label = [[UILabel alloc] init];
    label.text = title.uppercaseString;
    label.textColor = [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:0.90];
    label.font = [UIFont systemFontOfSize:12 weight:UIFontWeightBlack];
    [panel addArrangedSubview:label];
    [panel addArrangedSubview:content];
    return panel;
}

- (UIButton*)makeButton:(NSString*)title action:(SEL)action primary:(BOOL)primary
{
    UIButton* button = [UIButton buttonWithType:UIButtonTypeSystem];
    [button setTitle:title forState:UIControlStateNormal];
    button.titleLabel.font = [UIFont systemFontOfSize:13 weight:UIFontWeightBlack];
    button.layer.cornerRadius = 12.0;
    button.contentEdgeInsets = UIEdgeInsetsMake (12, 8, 12, 8);

    if (primary)
    {
        button.backgroundColor = [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:1.0];
        [button setTitleColor:[UIColor colorWithRed:0.008 green:0.067 blue:0.067 alpha:1.0] forState:UIControlStateNormal];
    }
    else
    {
        button.backgroundColor = [UIColor colorWithWhite:1.0 alpha:0.08];
        [button setTitleColor:[UIColor colorWithWhite:0.92 alpha:1.0] forState:UIControlStateNormal];
        button.layer.borderWidth = 1.0;
        button.layer.borderColor = [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:0.22].CGColor;
    }

    [button addTarget:self action:action forControlEvents:UIControlEventTouchUpInside];
    return button;
}

- (UISlider*)makeSliderMin:(float)min max:(float)max value:(float)value action:(SEL)action
{
    UISlider* slider = [[UISlider alloc] init];
    slider.minimumValue = min;
    slider.maximumValue = max;
    slider.value = value;
    slider.tintColor = [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:1.0];
    [slider addTarget:self action:action forControlEvents:UIControlEventValueChanged];
    return slider;
}

- (UILabel*)valueLabel:(NSString*)text
{
    UILabel* label = [[UILabel alloc] init];
    label.text = text;
    label.textColor = [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:1.0];
    label.font = [UIFont monospacedDigitSystemFontOfSize:12 weight:UIFontWeightBlack];
    label.textAlignment = NSTextAlignmentRight;
    [label.widthAnchor constraintEqualToConstant:72.0].active = YES;
    return label;
}

- (UIView*)sliderRow:(NSString*)title slider:(UISlider*)slider value:(UILabel*)valueLabel
{
    UIStackView* row = [[UIStackView alloc] init];
    row.axis = UILayoutConstraintAxisHorizontal;
    row.spacing = 10.0;
    row.alignment = UIStackViewAlignmentCenter;

    UILabel* label = [[UILabel alloc] init];
    label.text = title.uppercaseString;
    label.textColor = [UIColor colorWithWhite:0.82 alpha:0.70];
    label.font = [UIFont systemFontOfSize:11 weight:UIFontWeightBlack];
    [label.widthAnchor constraintEqualToConstant:76.0].active = YES;

    [row addArrangedSubview:label];
    [row addArrangedSubview:slider];
    [row addArrangedSubview:valueLabel];
    return row;
}

- (UISegmentedControl*)segmented:(NSArray<NSString*>*)items action:(SEL)action
{
    UISegmentedControl* control = [[UISegmentedControl alloc] initWithItems:items];
    control.selectedSegmentTintColor = [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:1.0];
    [control setTitleTextAttributes:@{ NSForegroundColorAttributeName: [UIColor colorWithWhite:0.92 alpha:1.0] } forState:UIControlStateNormal];
    [control setTitleTextAttributes:@{ NSForegroundColorAttributeName: [UIColor colorWithRed:0.008 green:0.067 blue:0.067 alpha:1.0] } forState:UIControlStateSelected];
    [control addTarget:self action:action forControlEvents:UIControlEventValueChanged];
    return control;
}

- (UIView*)labelledControl:(NSString*)title control:(UIView*)control
{
    UIStackView* stack = [[UIStackView alloc] init];
    stack.axis = UILayoutConstraintAxisVertical;
    stack.spacing = 6.0;

    UILabel* label = [[UILabel alloc] init];
    label.text = title.uppercaseString;
    label.textColor = [UIColor colorWithWhite:0.82 alpha:0.70];
    label.font = [UIFont systemFontOfSize:11 weight:UIFontWeightBlack];

    [stack addArrangedSubview:label];
    [stack addArrangedSubview:control];
    return stack;
}

- (void)playTapped
{
    NSError* error = nil;
    if ([self.audioEngine startAndReturnError:&error])
    {
        self.statusLabel.text = @"Audio: playing";
        [self.audioEngine resetPlayback];
    }
    else
    {
        self.statusLabel.text = [NSString stringWithFormat:@"Audio error: %@", error.localizedDescription ?: @"unknown"];
    }
}

- (void)stopTapped
{
    [self.audioEngine stop];
    self.statusLabel.text = @"Audio: stopped";
}

- (void)generateTapped
{
    [self applyAllControlsToEngineAndRegenerate:YES];
    [self.audioEngine resetPlayback];
    [self refreshPatternText:@"Generated new melody."];
}

- (void)mutateTapped
{
    [self applyAllControlsToEngineAndRegenerate:NO];
    engine_.triggerEvent ("mutate", 1.0);
    [self.audioEngine resetPlayback];
    [self refreshPatternText:@"Mutated current melody."];
}

- (void)clearTapped
{
    engine_.triggerEvent ("clearPattern", 1.0);
    [self.audioEngine resetPlayback];
    [self refreshPatternText:@"Cleared pattern."];
}

- (void)tempoChanged:(UISlider*)slider
{
    int tempo = (int) slider.value;
    self.tempoValueLabel.text = [NSString stringWithFormat:@"%d BPM", tempo];
    engine_.setParameter ("tempo", (float) tempo);
    [self.audioEngine setTempo:(float) tempo];
}

- (void)mutationChanged:(UISlider*)slider
{
    int value = (int) slider.value;
    self.mutationValueLabel.text = [NSString stringWithFormat:@"%d%%", value];
    engine_.setParameter ("mutation", (float) value);
}

- (void)volumeChanged:(UISlider*)slider
{
    int value = (int) slider.value;
    self.volumeValueLabel.text = [NSString stringWithFormat:@"%d%%", value];
    engine_.setParameter ("masterVolume", (float) value / 100.0f);
    [self.audioEngine setMasterVolume:(float) value / 100.0f];
}

- (void)rootChanged:(UISegmentedControl*)control
{
    static const int roots[] = { 48, 50, 52, 53, 55, 57, 60 };
    NSInteger index = control.selectedSegmentIndex;
    if (index >= 0 && index < 7)
        engine_.setParameter ("rootNote", (float) roots[index]);
}

- (void)styleChanged:(UISegmentedControl*)control
{
    static const int styles[] = { 0, 1, 2, 3, 4 };
    NSInteger index = control.selectedSegmentIndex;
    if (index >= 0 && index < 5)
        engine_.setParameter ("styleType", (float) styles[index]);
}

- (void)scaleChanged:(UISegmentedControl*)control
{
    static const int scales[] = { 0, 1, 3, 7, 9 };
    NSInteger index = control.selectedSegmentIndex;
    if (index >= 0 && index < 5)
        engine_.setParameter ("scaleType", (float) scales[index]);
}

- (void)complexityChanged:(UISegmentedControl*)control
{
    NSInteger index = control.selectedSegmentIndex;
    if (index >= 0 && index < 4)
        engine_.setParameter ("complexityType", (float) index);
}

- (void)waveformChanged:(UISegmentedControl*)control
{
    NSInteger index = control.selectedSegmentIndex;
    if (index >= 0 && index < 4)
    {
        engine_.setParameter ("synthWave", (float) index);
        [self.audioEngine setSynthWave:(int) index];
    }
}

- (void)applyAllControlsToEngineAndRegenerate:(BOOL)regenerate
{
    [self tempoChanged:self.tempoSlider];
    [self mutationChanged:self.mutationSlider];
    [self volumeChanged:self.volumeSlider];
    [self rootChanged:self.rootControl];
    [self styleChanged:self.styleControl];
    [self scaleChanged:self.scaleControl];
    [self complexityChanged:self.complexityControl];
    [self waveformChanged:self.waveformControl];

    if (regenerate)
        engine_.triggerEvent ("generate", 1.0);
}

- (NSString*)midiNoteName:(int)note
{
    static NSArray<NSString*>* names;
    static dispatch_once_t onceToken;
    dispatch_once (&onceToken, ^{
        names = @[ @"C", @"C#", @"D", @"D#", @"E", @"F", @"F#", @"G", @"G#", @"A", @"A#", @"B" ];
    });

    int index = note % 12;
    if (index < 0) index += 12;
    int octave = (note / 12) - 1;
    return [NSString stringWithFormat:@"%@%d", names[(NSUInteger) index], octave];
}

- (void)refreshPatternText:(NSString*)headline
{
    std::ostringstream os;
    os << [headline UTF8String] << "\n\n";
    os << "Step | Note | On | Glide | Random\n";
    os << "-----+------+----+-------+--------\n";

    for (int i = 0; i < LogicalChaosEngine::kMaxSteps; ++i)
    {
        const auto& s = engine_.getStep (i);
        NSString* noteName = [self midiNoteName:s.note];
        os.width (4);
        os << (i + 1) << " | ";
        os.width (4);
        os << [noteName UTF8String] << " |  ";
        os << (s.active ? "Y" : "-") << " |   ";
        os << (s.glide ? "Y" : "-") << "   |   ";
        os << (s.randomise ? "Y" : "-") << "\n";
    }

    self.patternView.text = [NSString stringWithUTF8String:os.str().c_str()];
}

@end
